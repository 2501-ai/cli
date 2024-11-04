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

function getTerminalWidth(): number {
  if (process.stdout.isTTY) {
    return process.stdout.columns;
  } else {
    return 80;
  }
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
  #lastUpdateTime = 0;

  constructor(public spin = p.spinner()) {}

  intro(message?: string) {
    p.intro(message);
  }

  log(message: string) {
    p.log.message(message);
  }

  outro(message: string) {
    p.outro(message);
  }

  cancel(message?: string, stopMessage?: string) {
    this.stop(stopMessage);
    p.cancel(message);
  }

  start(message?: string) {
    const terminalWidth = getTerminalWidth();
    const maxMessageLength = terminalWidth - 10;
    const truncatedMessage = message
      ? message.substring(0, maxMessageLength)
      : undefined;

    if (this.#spinnerStarted) {
      this.spin.message(truncatedMessage);
      return;
    }

    if (truncatedMessage && truncatedMessage.length > maxMessageLength) {
      this.spin.message(truncatedMessage.slice(0, maxMessageLength));
    }

    this.spin.start(truncatedMessage);
    this.#spinnerStarted = true;
  }

  message(message: string) {
    const now = Date.now();
    if (now - this.#lastUpdateTime < 100) {
      return;
    }
    this.#lastUpdateTime = now;

    const terminalWidth = getTerminalWidth();
    const maxMessageLength = terminalWidth - 10;
    const truncatedMessage = message.substring(0, maxMessageLength);
    this.spin.message(truncatedMessage);
  }

  stop(message?: string, code?: number) {
    if (!this.#spinnerStarted) {
      this.spin.message(message);
      return;
    }
    this.spin.stop(message, code);
    this.#spinnerStarted = false;
  }

  prompt(
    message: string,
    promptType: 'string' | 'boolean' = 'boolean'
  ): Promise<any> {
    if (promptType === 'string') {
      return p.password({
        message,
        validate: (value) => {
          if (!value) return 'Please enter an Api Key.';
          if (!value.startsWith('2501_ak_'))
            return 'Please enter a valid Api Key.';
        },
      });
    }

    return p.select<any, boolean>({
      message,
      options: [
        {
          value: true,
          label: 'Yes',
        },
        {
          value: false,
          label: 'No',
        },
      ],
      initialValue: false,
    });
  }

  handleError(
    e: Error | AxiosError,
    defaultMsg = 'Unexpected error. Please try again !'
  ) {
    if (isDebug) {
      let msg = '';
      if (axios.isAxiosError(e)) {
        const axiosError = e as AxiosError;
        msg = (axiosError.response?.data as { error: string })?.error;
        Logger.error('Command error - Axios error', {
          code: axiosError.code,
          message: axiosError.message,
          name: axiosError.name,
          responseData: axiosError.response?.data || 'no error',
          data: axiosError.toJSON(),
        });
        if (axiosError.code === 'ECONNREFUSED') {
          defaultMsg = 'Server unreachable. Please try again later.';
        }
        // Logger.error('Command error - Axios error', axiosError.toJSON());
      } else {
        Logger.error('Command error', e);
      }
      this.cancel(msg || defaultMsg);
      return;
    }

    let msg = '';
    if (axios.isAxiosError(e)) {
      const axiosError = e as AxiosError;
      const errorData = axiosError.response?.data as { code?: string };

      msg = (axiosError.response?.data as { error: string })?.error;
      if (axiosError.response?.status === 401) {
        defaultMsg = 'Unauthorized. Please verify your API key.';
      }

      if (axiosError.response?.status === 403) {
        if (errorData?.code === 'TOKEN_LIMIT') {
          defaultMsg =
            'Monthly token usage limit reached. Please upgrade your plan or contact us !';
        }
      }

      if (axiosError.response?.status === 500) {
        defaultMsg = 'The server has returned an error. Please try again';
      }

      if (axiosError.code === 'ECONNREFUSED') {
        defaultMsg = 'Server unreachable. Please try again later.';
      }
    }
    this.cancel(msg || defaultMsg);
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
