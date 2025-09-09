import * as cheerio from 'cheerio';
import execa from 'execa';
import fs from 'fs';
import path from 'path';
import TurndownService from 'turndown';

import { CONFIG_DIR } from '../constants';
import { isCommandNotFound } from '../remoteExecution/connectionParser';
import { RemoteExecutor } from '../remoteExecution/remoteExecutor';
import { IgnoreManager } from '../utils/ignore';
import Logger from '../utils/logger';
import { modifyCodeSections } from '../utils/sectionUpdate';

export const LOG_DIR = path.join(CONFIG_DIR, 'logs');
export const LOGFILE_PATH = path.join(LOG_DIR, 'commands.log');
export const ERRORFILE_PATH = path.join(LOG_DIR, 'errors.log');

export function read_file(args: { path: string }): string | null {
  try {
    if (RemoteExecutor.instance.isEnabled()) {
      // For remote execution, we'll need to handle this differently
      // For now, return null to indicate file not found
      return null;
    }

    const data = fs.readFileSync(args.path, 'utf8');
    return data;
  } catch (error) {
    Logger.error('Error reading file:', error);
    return null;
  }
}

export async function write_file(args: {
  path: string;
  content: string;
}): Promise<string> {
  if (RemoteExecutor.instance.isEnabled()) {
    const escapedContent = args.content.replace(/"/g, '\\"');
    const config = RemoteExecutor.instance.getConfig();
    try {
      if (config.type === 'winrm') {
        // For WinRM, we need to use the `echo` command to write the file
        const { stdout: result } = await RemoteExecutor.instance.executeCommand(
          `powershell Write-Host ${escapedContent || ''} -NoNewline > "${args.path}"`
        );
        if (isCommandNotFound(result)) {
          throw new Error(`Failed to write file: '${result}'`);
        }
      } else {
        await RemoteExecutor.instance.executeCommand(
          `tee "${args.path}"`,
          escapedContent
        );
      }
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
  answer: string;
  sectionsDiff: string[];
  path: string;
}) {
  Logger.debug('Updating sections:', sectionsDiff);

  try {
    let fileContent: string;
    if (RemoteExecutor.instance.isEnabled()) {
      const { stdout } = await RemoteExecutor.instance.executeCommand(
        `cat "${path}"`
      );
      fileContent = stdout;
    } else {
      fileContent = fs.readFileSync(path, 'utf8');
    }

    const newContent = modifyCodeSections({
      originalContent: fileContent,
      diffSections: sectionsDiff,
    });

    if (RemoteExecutor.instance.isEnabled()) {
      // Write file remotely.
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
  onPrompt,
}: {
  command: string;
  shell?: boolean | string;
  env?: { [key: string]: string };
  onPrompt?: (command: string, stdout: string) => Promise<string>;
}): Promise<string> {
  Logger.debug(`Running shell command: ${command}`);

  if (RemoteExecutor.instance.isEnabled()) {
    try {
      const { stdout: result } = await RemoteExecutor.instance.executeCommand(
        command,
        undefined,
        false,
        onPrompt
      );

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

export async function task_completed(args: { response?: string }) {
  return args?.response || 'Task completed!';
}

export type FunctionName =
  | 'update_file'
  | 'write_file'
  | 'read_file'
  | 'run_shell'
  | 'browse_url'
  | 'task_completed';

export interface Actions extends Record<FunctionName, (...args: any[]) => any> {
  read_file: typeof read_file;
  write_file: typeof write_file;
  update_file: typeof update_file;
  run_shell: typeof run_shell;
  browse_url: typeof browse_url;
  task_completed: typeof task_completed;
}
