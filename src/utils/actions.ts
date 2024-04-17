import fs from 'fs';
import path from 'path';
import TurndownService from 'turndown';
import execa from 'execa';

export async function write_file(args: { path: string; content: string }) {
  fs.mkdirSync(path.dirname(args.path), { recursive: true });
  fs.writeFileSync(args.path, args.content);
  return `
    File written to ${args.path}
    Content :
    ${args.content}`;
}

export async function run_shell(args: { command: string }) {
  let output: string = '';

  try {
    const { stderr, stdout } = await execa(args.command, {
      shell: true,
      timeout: 1000 * 60 * 5,
    });

    if (stdout) output += stdout;
    if (stderr) output += stderr;

    const logfile = `/tmp/2501/logs/test.log`;
    if (!fs.existsSync('/tmp/2501/logs'))
      fs.mkdirSync('/tmp/2501/logs', { recursive: true });
    fs.writeFileSync(logfile, output);

    return output;
  } catch (error: any) {
    return `ERROR : I failed to run ${args.command}, please fix the situation, errors below.\n ${error.message} \n ${error}`;
  }
}

export async function browse_url(args: { url: string }) {
  const html = await fetch(args.url).then((res) => res.text());
  const turndownService = new TurndownService();
  const md = turndownService.turndown(html);
  return `
    Result of content of page as markdown :
    ${md.replace(/\s+/g, '')}
  `;
}