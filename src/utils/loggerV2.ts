import * as p from '@clack/prompts';
import { AxiosError } from 'axios';

import { terminal } from 'terminal-kit';

enum Colors {
  RED = 'red',
  GREEN = 'green',
  YELLOW = 'yellow',
  BLUE = 'blue',
  MAGENTA = 'magenta',
  CYAN = 'cyan',
  WHITE = 'white',
}

export default class Logger {
  spin: any;

  intro(message: string) {
    p.intro(message);
  }

  outro(message: string) {
    p.outro(message);
  }

  start(message?: string) {
    this.spin = p.spinner();
    this.spin.start(message);
  }

  message(message: string) {
    this.spin.message(message);
  }

  stop(message?: string) {
    this.spin.stop(message);
  }

  static error(...args: (Error | AxiosError | string | unknown)[]) {
    terminal[Colors.RED]('\n[ERROR] ').defaultColor(
      ...args.map((a) => {
        if (a instanceof Error) {
          return `${a.message}\n${a.stack}\n`;
        }
        return (
          `${typeof a === 'object' ? JSON.stringify(a, null, 2) : a}` + '\n'
        );
      })
    );
  }
}
