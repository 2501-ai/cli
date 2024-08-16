import { AxiosError } from 'axios';

/**
 * using realTerminal in terminal-kit was on purpose since we were having issues not using it before.
 * That it might be necessary in case of issues
 */
import { terminal } from 'terminal-kit';
import { marked } from 'marked';

enum Colors {
  RED = 'red',
  GREEN = 'green',
  YELLOW = 'yellow',
  BLUE = 'blue',
  MAGENTA = 'magenta',
  CYAN = 'cyan',
  WHITE = 'white',
}
// TODO: use a better logger ? Winston, Pino ? etc..

export class Logger {
  static error(...args: (Error | AxiosError | string | unknown)[]) {
    if ((args[0] as AxiosError).isAxiosError) {
      const [arg0, ...rest] = args;
      terminal[Colors.RED]('[HTTP ERROR] ').defaultColor(
        (arg0 as AxiosError).toJSON(),
        ...rest,
        '\n'
      );
    } else {
      // terminal[Colors.RED]('\n[ERROR] ').defaultColor(...args);
      console.error('[ERROR] ', ...args, '\n');
    }
  }

  /**
   * Log the agent data in a formatted way
   */
  static agent(data: any) {
    terminal.bold('\nAGENT:\n');
    terminal(marked.parse(data) + '\n');
  }

  static warn(...args: unknown[]) {
    terminal[Colors.YELLOW]('[WARN] ').defaultColor(...(args + '\n'));
  }

  static success(content: string) {
    terminal[Colors.GREEN]('SUCCESS] ').defaultColor(content + '\n');
  }

  static log(...args: unknown[]) {
    terminal[Colors.BLUE]('[INFO] ').defaultColor(...(args + '\n'));
  }
}
