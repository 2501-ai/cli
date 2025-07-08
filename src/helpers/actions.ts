import fs from 'fs';
import path from 'path';
import TurndownService from 'turndown';
import execa from 'execa';
import * as cheerio from 'cheerio';

import Logger from '../utils/logger';

import { modifyCodeSections } from '../utils/sectionUpdate';
import { IgnoreManager } from '../utils/ignore';
import { getLogDir } from '../utils/platform';
import { ConfigManager } from '../managers/configManager';
import { RemoteExecutor } from '../managers/remoteExecutor';
import { WinRMExecutor } from '../managers/winrmExecutor';

/**
 * Directory to store logs
 */
export const LOG_DIR = getLogDir();

/**
 * File to log the output of the command
 */
export const LOGFILE_PATH = `${LOG_DIR}/test.log`;

/**
 * File to log the error of the command.
 */
export const ERRORFILE_PATH = `${LOG_DIR}/error.log`;

export function read_file(args: { path: string }): string | null {
  Logger.debug(`Reading file at "${args.path}"`);
  if (!fs.existsSync(args.path)) return null;

  return fs.readFileSync(args.path, 'utf8');
}

export async function write_file(args: {
  path: string;
  content: string;
}): Promise<string> {
  if (ConfigManager.instance.get('remote_exec')) {
    const escapedContent = args.content.replace(/"/g, '\\"');
    try {
      await RemoteExecutor.instance.executeCommand(
        `tee "${args.path}"`,
        escapedContent
      );
    } catch (error) {
      throw new Error(`Failed to write file: ${error}`);
    }

    return `
    File written: ${args.path}
    ${escapedContent}`;
  }

  Logger.debug(`Writing file at "${args.path}"`);
  try {
    fs.mkdirSync(path.dirname(args.path), { recursive: true });
    fs.writeFileSync(args.path, args.content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      try {
        // Attempt to write with sudo
        const escapedContent = args.content.replace(/"/g, '\\"');
        await run_shell({
          command: `echo "${escapedContent}" | sudo tee "${args.path}" > /dev/null`,
        });
      } catch (e) {
        throw new Error(`Failed to write file with sudo: ${e}`);
      }
    } else {
      throw error;
    }
  }

  const ignoreManager = IgnoreManager.getInstance();
  const content = ignoreManager.isIgnored(args.path)
    ? ''
    : `Content :
    ${args.content}`;
  return `
    File written: ${args.path}
    ${content}`;
}

export async function update_file({
  sectionsDiff,
  path,
}: {
  path: string;
  answer: string;
  sectionsDiff: string[];
}) {
  Logger.debug('Updating sections:', sectionsDiff);

  try {
    const fileContent = ConfigManager.instance.get('remote_exec')
      ? await RemoteExecutor.instance.executeCommand(`cat "${path}"`)
      : fs.readFileSync(path, 'utf8');

    const newContent = modifyCodeSections({
      originalContent: fileContent,
      diffSections: sectionsDiff,
    });

    if (ConfigManager.instance.get('remote_exec')) {
      await write_file({ path, content: newContent });
    } else {
      try {
        fs.writeFileSync(path, newContent);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EACCES') {
          try {
            const escapedContent = newContent.replace(/"/g, '\\"');
            await run_shell({
              command: `echo "${escapedContent}" | sudo tee "${path}" > /dev/null`,
            });
          } catch (e) {
            throw new Error(`Failed to write file with sudo: ${e}`);
          }
        } else {
          throw error;
        }
      }
    }

    const ignoreManager = IgnoreManager.getInstance();
    const content = ignoreManager.isIgnored(path)
      ? ''
      : `New file Content :
    \`\`\`
    ${newContent}
    \`\`\``;

    return `
    File updated: ${path}
    ${content}`;
  } catch (error) {
    return `${ERROR_BOL} I failed to run update_file on ${path}, please fix the situation, errors below.\n ${(error as Error).message}
    ${error}`;
  }
}

function logExecution(result: string) {
  // Recursive creation of log directory, doesn't throw an error if it already exists.
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(LOGFILE_PATH, result + '\n');
}

export async function run_shell({
  command,
  shell,
  env,
}: {
  command: string;
  shell?: boolean | string;
  env?: { [key: string]: string };
}): Promise<string> {
  Logger.debug(`Running shell command: ${command}`);

  const config = ConfigManager.instance;

  // Check if remote execution is enabled
  if (config.get('remote_exec')) {
    try {
      const remoteType = config.get('remote_exec_type');
      let result: string;

      if (remoteType === 'win') {
        result = await WinRMExecutor.instance.executeCommand(command);
      } else {
        result = await RemoteExecutor.instance.executeCommand(command);
      }

      logExecution(result);

      return result;
    } catch (error) {
      Logger.error('Remote execution failed:', error);
      return `${ERROR_BOL} I failed to run ${command}, please fix the situation, errors below.\n ${(error as Error).message}
    ${error}`;
    }
  }

  // Local execution
  try {
    const { stderr, stdout } = await execa(command, {
      shell: shell || true,
      preferLocal: true,
      env,
    });

    let output = '';
    if (stdout) output += stdout;
    if (stderr) output += stderr;

    logExecution(output);

    return output;
  } catch (error) {
    return `${ERROR_BOL} I failed to run ${command}, please fix the situation, errors below.\n ${(error as Error).message}
    ${error}`;
  }
}

export const ERROR_BOL = `ERROR :`; // beginning of line

export const hasError = (output: string) => {
  return output.startsWith(ERROR_BOL);
};

export async function browse_url(args: { url: string }) {
  const html = await fetch(args.url).then((res) => res.text());
  const $ = cheerio.load(html);

  // Remove script and style elements
  $('script').remove();
  $('style').remove();

  // Optionally, you can remove other elements like iframes, images, etc.
  $('iframe, img, video, object').remove();

  // Extract the textual content
  const text = $('body').text();

  const turndownService = new TurndownService();
  const md = turndownService.turndown(text);
  return `
    Result of content of page :
    ${md.replace(/\s+/g, '')}
  `;
}

export async function task_completed(args: {
  output?: string;
  summary?: string;
}) {
  return args?.summary || args?.output || 'Task completed!';
}
