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

const stringify = (args: any[]) => {
  const seen = new WeakSet();

  // Method to safely stringify objects, avoiding circular references
  const safeStringify = (obj: any) => {
    return JSON.stringify(
      obj,
      (key, value) => {
        if (key.startsWith('_')) {
          return undefined;
        }
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular]';
          }
          seen.add(value);
        }
        return value;
      },
      2
    );
  };

  return args.map((a) => {
    if (a instanceof Error) {
      return `${a.message}\n${a.stack}\n`;
    }
    return `${typeof a === 'object' ? safeStringify(a) : a}` + '\n';
  });
};

export default class Logger {
  #spinnerStarted = false;
  constructor(public spin = p.spinner()) {}

  intro(message: string) {
    p.intro(message);
  }

  outro(message: string) {
    p.outro(message);
  }

  cancel(message: string) {
    this.spin.stop();
    p.cancel(message);
  }

  start(message?: string) {
    if (this.#spinnerStarted) {
      this.spin.message(message);
      return;
    }
    this.spin.start(message);
    this.#spinnerStarted = true;
  }

  message(message: string) {
    this.spin.message(message);
  }

  stop(message?: string) {
    if (!this.#spinnerStarted) {
      this.spin.message(message);
      return;
    }
    this.spin.stop(message);
    this.#spinnerStarted = false;
  }

  static agent(data: any) {
    p.outro(marked.parse(data) as string);
    // terminal.bold('\nAGENT:\n');
    // terminal(marked.parse(data) + '\n');
  }

  static log(...args: unknown[]) {
    terminal.defaultColor(
      ...args.map(
        (a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : a) + '\n'
      )
    );
  }

  static error(...args: (Error | AxiosError | string | unknown)[]) {
    terminal[Colors.RED]('\n[ERROR] ').defaultColor(...stringify(args));
  }

  static debug(...args: unknown[]) {
    if (isDebug) {
      terminal[Colors.MAGENTA]('[DEBUG] ').defaultColor(...stringify(args));
    }
  }
}
