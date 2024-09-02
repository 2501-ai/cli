import * as p from '@clack/prompts';
import { AxiosError } from 'axios';
import { marked } from 'marked';

import { terminal } from 'terminal-kit';

const isDebug = process.env.DEBUG === 'true';

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
  constructor(public spin = p.spinner()) {}

  intro(message: string) {
    p.intro(message);
  }

  outro(message: string) {
    p.outro(message);
  }

  start(message?: string) {
    this.spin.start(message);
  }

  message(message: string) {
    this.spin.message(message);
  }

  stop(message?: string) {
    this.spin.stop(message);
  }

  static agent(data: any) {
    terminal.bold('\nAGENT:\n');
    terminal(marked.parse(data) + '\n');
  }

  static log(...args: unknown[]) {
    terminal.defaultColor(
      ...args.map(
        (a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : a) + '\n'
      )
    );
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
