import fs from 'fs';
import path from 'path';
import TurndownService from 'turndown';
import execa from 'execa';
import * as cheerio from 'cheerio';
import { Logger } from './logger';

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
  if (!fs.existsSync(args.path)) return null;

  return fs.readFileSync(args.path, 'utf8');
}

export async function write_file(args: { path: string; content: string }) {
  Logger.log(`Writing file at "${args.path}"`);
  fs.mkdirSync(path.dirname(args.path), { recursive: true });
  fs.writeFileSync(args.path, args.content);
  return `
    File written to ${args.path}
    Content :
    ${args.content}`;
}

/**
 * Updates content in a filePath synchronously, creating directories if necessary.
 * @param filePath The path of the filePath to update.
 * @param content The new content to write to the filePath.
 * @param lines The range of lines to replace in the filePath as 0-indexed tuple [start, end), where the first number is the inclusive start line and the second number is the end line exclusive.
 */
export async function modify_file({
  path: filePath,
  content,
  lines,
}: {
  path: string;
  content: string;
  lines: [number, number];
}) {
  // Ensure directory exists before updating filePath
  const directory = path.dirname(filePath);
  Logger.log(`Updating file at "${filePath}"`);
  try {
    fs.mkdirSync(directory, { recursive: true });
  } catch (err) {
    Logger.error(`Error creating directory: ${(err as Error).message}`);
    return `${ERROR_BOL} creating directory: ${(err as Error).message} \n ${err}`;
  }

  // Read existing filePath content
  let fileContent: string;
  try {
    fileContent = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    Logger.error(`Error reading filePath: ${(err as Error).message}`);
    return `${ERROR_BOL} reading filePath: ${(err as Error).message} \n ${err}`;
  }

  // Update content in memory
  const linesToUpdate = lines[1] - lines[0];
  const fileLines = fileContent.split('\n');
  let updatedLines: string[] | undefined = content.split('\n');
  updatedLines = updatedLines.length > 0 ? updatedLines : undefined;

  if (updatedLines) {
    fileLines.splice(lines[0], linesToUpdate, ...updatedLines);
  } else {
    fileLines.splice(lines[0], linesToUpdate);
  }
  const updatedContent = fileLines.join('\n');

  // Write updated content to filePath
  try {
    fs.writeFileSync(filePath, updatedContent, 'utf8');
    return `File at "${filePath}" updated successfully.`;
  } catch (err) {
    Logger.error(`Error writing to path: ${(err as Error).message}`);
    return `${ERROR_BOL} writing to path: ${(err as Error).message} \n ${err}`;
  }
}

export async function run_shell(args: {
  command: string;
  shell?: boolean | string;
  env?: { [key: string]: string };
}): Promise<string> {
  let output: string = '';

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
    return `${ERROR_BOL} I failed to run ${args.command}, please fix the situation, errors below.\n ${(error as Error).message} \n ${error}`;
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
