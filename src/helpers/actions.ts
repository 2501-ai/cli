import fs from 'fs';
import path from 'path';
import TurndownService from 'turndown';
import execa from 'execa';
import * as cheerio from 'cheerio';

import Logger from '../utils/logger';
import { modifyCodeSections } from '../utils/sectionUpdate';
import { getIgnoredFiles } from '../utils/files';
import { ShellManager } from '../managers/shellManager';

/**
 * Directory to store logs
 */
const LOG_DIR = `/tmp/2501/logs`;

/**
 * File to log the output of the command
 */
export const LOGFILE_PATH = `${LOG_DIR}/test.log`;

/**
 * File to log the error of the command.
 */
export const ERRORFILE_PATH = `${LOG_DIR}/error.log`;

const isIgnoredFile = (filePath: string) =>
  getIgnoredFiles(path.dirname(filePath)).has(filePath);

export function read_file(args: { path: string }): string | null {
  Logger.debug(`Reading file at "${args.path}"`);
  if (!fs.existsSync(args.path)) return null;

  return fs.readFileSync(args.path, 'utf8');
}

export async function write_file(args: { path: string; content: string }) {
  Logger.debug(`Writing file at "${args.path}"`);
  fs.mkdirSync(path.dirname(args.path), { recursive: true });
  fs.writeFileSync(args.path, args.content);
  const content = isIgnoredFile(args.path)
    ? ''
    : `Content :
    ${args.content}`;
  return `
    File written: ${args.path}
    ${content}`;
}

export function update_file({
  sectionsDiff,
  path,
}: {
  path: string;
  answer: string;
  sectionsDiff: string[];
}) {
  Logger.debug('Updating sections:', sectionsDiff);
  const fileContent = fs.readFileSync(path, 'utf8');
  const newContent = modifyCodeSections({
    originalContent: fileContent,
    diffSections: sectionsDiff,
  });

  const content = isIgnoredFile(path)
    ? ''
    : `New file Content :
    \`\`\`
    ${newContent}
    \`\`\``;

  fs.writeFileSync(path, newContent);

  return `
    File updated: ${path}
    ${content}`;
}

export async function run_shell(
  args: {
    command: string;
    shell?: boolean | string;
    env?: { [key: string]: string };
    sync?: boolean;
  },
  context?: { workspace: string }
): Promise<string> {
  Logger.debug(`Running shell command: ${args.command}`);

  if (!args.sync) {
    if (!context?.workspace) {
      return `Error: Background process can only be run in a workspace context`;
    }
    const process = await ShellManager.instance.executeAsync(args.command);

    // Store the running process in the workspace state.
    ShellManager.instance.addProcessToWorkspace(process, context.workspace);

    return `Process started with PID: ${process.pid}`;
  }

  try {
    const { stderr, stdout } = await execa(args.command, {
      shell: args.shell ?? true,
      env: args.env,
      preferLocal: true,
      timeout: 1000 * 60,
    });

    let output = '';
    if (stdout) output += stdout;
    if (stderr) output += stderr;

    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    fs.writeFileSync(LOGFILE_PATH, output);

    return output;
  } catch (error) {
    return `Error running command: ${args.command}\n${error}`;
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

export async function check_process_status(
  args: {
    processId?: string;
  },
  context: {
    workspace: string;
  }
): Promise<string> {
  if (args.processId) {
    const status = await ShellManager.instance.getShellprocess(
      args.processId,
      context.workspace
    );
    if (!status) {
      return `No process found with ID: ${args.processId}`;
    }
    return JSON.stringify(
      {
        command: status.command,
        status: status.status,
        pid: status.pid,
        startTime: status.startTime,
        output: status.output,
      },
      null,
      2
    );
  }

  const processes = ShellManager.instance.getAllProcesses();
  if (processes.length === 0) {
    return 'No running processes found';
  }

  return JSON.stringify(
    processes.map((proc) => ({
      command: proc.command,
      status: proc.status,
      pid: proc.pid,
      startTime: proc.startTime,
    })),
    null,
    2
  );
}
