import fs from 'fs';
import path from 'path';
import execa from 'execa';

import Logger from '../utils/logger';

import { modifyCodeSections } from '../utils/sectionUpdate';
import { IgnoreManager } from '../utils/ignore';

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

export function read_file(args: { path: string }): string | null {
  Logger.debug(`Reading file at "${args.path}"`);
  if (!fs.existsSync(args.path)) return null;

  return fs.readFileSync(args.path, 'utf8');
}

export async function write_file(args: { path: string; content: string }) {
  Logger.debug(`Writing file at "${args.path}"`);
  fs.mkdirSync(path.dirname(args.path), { recursive: true });
  fs.writeFileSync(args.path, args.content);
  const ignoreManager = IgnoreManager.getInstance();
  const content = ignoreManager.isIgnored(args.path)
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

  try {
    const fileContent = fs.readFileSync(path, 'utf8');
    const newContent = modifyCodeSections({
      originalContent: fileContent,
      diffSections: sectionsDiff,
    });

    const ignoreManager = IgnoreManager.getInstance();
    const content = ignoreManager.isIgnored(path)
      ? ''
      : `New file Content :
    \`\`\`
    ${newContent}
    \`\`\``;

    fs.writeFileSync(path, newContent);

    return `
    File updated: ${path}
    ${content}`;
  } catch (error) {
    return `${ERROR_BOL} I failed to run update_file on ${path}, please fix the situation, errors below.\n ${(error as Error).message}
    ${error}`;
  }
}

export async function run_shell(args: {
  command: string;
  shell?: boolean | string;
  env?: { [key: string]: string };
}): Promise<string> {
  let output: string = '';
  Logger.debug(`    Running shell command: ${args.command}`);

  try {
    const { stderr, stdout } = await execa(args.command, {
      shell: args.shell ?? true,
      env: args.env,
      preferLocal: true,
    });

    if (stdout) output += stdout;
    if (stderr) output += stderr;

    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    fs.writeFileSync(LOGFILE_PATH, output);

    return output;
  } catch (error) {
    return `${ERROR_BOL} I failed to run ${args.command}, please fix the situation, errors below.\n ${(error as Error).message}
    ${error}`;
  }
}

export const ERROR_BOL = `ERROR :`; // beginning of line

export const hasError = (output: string) => {
  return output.startsWith(ERROR_BOL);
};
