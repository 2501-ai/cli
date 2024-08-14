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
      terminal[Colors.RED]('\n[HTTP ERROR] ').defaultColor(
        (arg0 as AxiosError).toJSON(),
        ...rest
      );
    } else {
      // terminal[Colors.RED]('\n[ERROR] ').defaultColor(...args);
      console.error('\n[ERROR] ', ...args);
    }
  }

  /**
   * Log the agent data in a formatted way
   */
  static agent(data: any) {
    terminal.bold('\n\nAGENT:\n');
    terminal(marked.parse(data));
  }

  static warn(...args: unknown[]) {
    terminal[Colors.YELLOW]('\n[WARN] ').defaultColor(...args);
  }

  static success(content: string) {
    terminal[Colors.GREEN]('\n[SUCCESS] ').defaultColor(content);
  }

  static log(...args: unknown[]) {
    terminal[Colors.BLUE]('\n[INFO] ').defaultColor(...args);
  }
}
