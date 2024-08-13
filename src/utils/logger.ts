import { AxiosError } from 'axios';
import { terminal } from 'terminal-kit';

// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config();

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

  static warn(content: string) {
    terminal[Colors.YELLOW]('\n[WARN] ').defaultColor(content);
  }

  static success(content: string) {
    terminal[Colors.GREEN]('\n[SUCCESS] ').defaultColor(content);
  }

  static log(...args: unknown[]) {
    terminal[Colors.BLUE]('\n[INFO] ').defaultColor(...args);
  }
}
