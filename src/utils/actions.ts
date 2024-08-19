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
 * @param path The path of the filePath to update.
 * @param modifications The modifications to apply to the content.
 * @returns A message indicating the success or failure of the operation.
 */
export async function modify_file({
  path: filePath,
  modifications,
}: {
  path: string;
  modifications: { content: string; lines: { start: number; end: number } }[];
}) {
  // Ensure directory exists before updating filePath
  const directory = path.dirname(filePath);
  Logger.debug(`Updating file at "${filePath}"`);
  Logger.debug('modifications :', modifications.length);

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

  // Initialize updated content with the original content
  let updatedContent = fileContent;

  // As we modify the content, we need to keep track of the delta so update the line numbers correctly after each modification.
  let delta = 0;

  // For each modification, update the content
  for (const { content, lines } of modifications) {
    Logger.debug('lines :', lines);
    // Logger.debug('content :', content);
    Logger.debug('delta :', delta);

    // Inclusive range. Add 1 to include the last line.
    const linesToUpdate = lines.end - lines.start + 1;
    const fileLines = updatedContent.split('\n');
    Logger.debug('file lines :', fileLines);

    let contentLines: string[] | undefined = content
      .split('\n')
      .filter((line) => !!line);
    contentLines = contentLines.length > 0 ? contentLines : undefined;
    Logger.debug('contentLines :', contentLines);
    Logger.debug('Action :', contentLines ? 'Update' : 'Delete');

    // Update the content
    if (contentLines) {
      fileLines.splice(lines.start - 1 + delta, linesToUpdate, ...contentLines);
      // Take into account the delta for the next modification: the number of lines added or removed.
      delta += (contentLines?.length || 0) - linesToUpdate;
    } else {
      if (!contentLines) {
        // Delete the content
        fileLines.splice(lines.start - 1 + delta, linesToUpdate);
      } else {
        // Insert the content
        fileLines.splice(lines.start - 1 + delta, 0, contentLines);
      }
      // Take into account the delta for the next modification: the number of lines added or removed.
      delta -= linesToUpdate;
    }
    updatedContent = fileLines.join('\n');
  }

  // Write updated content to filePath
  try {
    fs.writeFileSync(filePath, updatedContent, 'utf8');
    Logger.log(`File at "${filePath}" updated successfully.`);
    return `File at "${filePath}" has been updated. here is the new content to verify :
    ###BEGIN-UPDATED-FILE-CONTENT###
    ${updatedContent}
    ###END-UPDATED-FILE-CONTENT###
    `;
  } catch (err) {
    Logger.error(`Error writing to path: ${(err as Error).message}`);
    return `Error writing to path: ${(err as Error).message} \n ${err}`;
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
