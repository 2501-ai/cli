import fs from 'fs';
import path from 'path';
import TurndownService from 'turndown';
import execa from 'execa';
import * as cheerio from 'cheerio';

import Logger from '../utils/logger';

import { getIgnoredFiles } from './workspace';
import { modifyCodeSections } from '../utils/sectionUpdate';

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
    File written to ${args.path}
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
      timeout: 1000 * 60 * 5,
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
     \`\`\`
     ${error}
     \`\`\``;
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
