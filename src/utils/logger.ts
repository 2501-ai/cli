import * as p from '@clack/prompts';
import axios, { AxiosError } from 'axios';
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

  intro(message?: string) {
    p.intro(message);
  }

  outro(message: string) {
    p.outro(message);
  }

  cancel(message?: string, stopMessage?: string) {
    this.spin.stop(stopMessage);
    p.cancel(message);
    this.#spinnerStarted = false;
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

  handleError(
    e: Error | AxiosError,
    defaultMsg = 'The server has returned an error. Please try again'
  ) {
    if (isDebug) {
      if (axios.isAxiosError(e)) {
        const axiosError = e as AxiosError;
        Logger.error('Command error - Axios error', {
          code: axiosError.code,
          message: axiosError.message,
          name: axiosError.name,
          responseData: axiosError.response?.data || 'no error',
          data: axiosError.toJSON(),
        });
        // Logger.error('Command error - Axios error', axiosError.toJSON());
      } else {
        Logger.error('Command error', e);
      }
      return;
    }

    if (axios.isAxiosError(e)) {
      const axiosError = e as AxiosError;
      const errorData = axiosError.response?.data as { code?: string };
      if (axiosError.response?.status === 401) {
        this.cancel('Unauthorized. Please login again');
        return;
      }

      if (axiosError.response?.status === 403) {
        if (errorData?.code === 'TOKEN_LIMIT') {
          this.cancel(
            'Monthly token usage limit reached. Please upgrade your plan or contact us !'
          );
          return;
        }
      }
    }
    this.cancel(defaultMsg);
    // this.cancel(defaultMsg)
    // Logger.error("Unexpected error. We're working on it!");
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
