import * as p from '@clack/prompts';

export default class Logger {
  spin: any;

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

  error(message: string) {
    this.spin.fail(message);
  }
}
