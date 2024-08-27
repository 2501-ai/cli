import { AxiosError } from 'axios';
import { terminal } from 'terminal-kit';
import { marked } from 'marked';

// TODO: use a better logger ? Winston, Pino ? etc..

enum Colors {
  RED = 'red',
  GREEN = 'green',
  YELLOW = 'yellow',
  BLUE = 'blue',
  MAGENTA = 'magenta',
  CYAN = 'cyan',
  WHITE = 'white',
}

const isDebug = process.env.DEBUG === 'true';

export class Logger {
  static error(...args: (Error | AxiosError | string | unknown)[]) {
    terminal[Colors.RED]('\n[ERROR] ').defaultColor(
      ...args.map((a) => {
        if (a instanceof Error) {
          return `${a.message}\n${a.stack}`;
        }
        return `${typeof a === 'object' ? JSON.stringify(a, null, 2) : a}`;
      })
    );
  }

  static agent(data: any) {
    terminal.bold('\nAGENT:\n');
    terminal(marked.parse(data) + '\n');
  }

  static warn(...args: unknown[]) {
    terminal[Colors.YELLOW]('[WARN] ').defaultColor(
      ...args.map(
        (a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : a) + '\n'
      )
    );
  }

  static success(content: string) {
    terminal[Colors.GREEN]('SUCCESS] ').defaultColor(content + '\n');
  }

  static log(...args: unknown[]) {
    terminal[Colors.BLUE]('[INFO] ').defaultColor(
      ...args.map(
        (a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : a) + '\n'
      ),
      '\n'
    );
  }

  static debug(...args: unknown[]) {
    if (isDebug) {
      terminal[Colors.MAGENTA]('[DEBUG] ').defaultColor(
        ...args.map(
          (a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : a) + '\n'
        )
      );
    }
  }
}
