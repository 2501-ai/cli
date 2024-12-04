import { ShellManager } from '../managers/shellManager';

interface ProcessPoolConfig {
  maxConcurrent: number;
  timeout: number;
}

const config: ProcessPoolConfig = {
  maxConcurrent: 5,
  timeout: 1000,
};

export class ProcessPool {
  private running: Set<string> = new Set();
  private queue: Array<{
    command: string;
    resolve: (value: string | PromiseLike<string>) => void;
  }> = [];

  async execute(commands: string[]): Promise<Map<string, any>> {
    const results = new Map<string, any>();

    for (const cmd of commands) {
      const processId = await this.scheduleCommand(cmd);
      results.set(processId, ShellManager.getInstance().getStatus(processId));
    }

    return results;
  }

  private async scheduleCommand(command: string): Promise<string> {
    if (this.running.size >= config.maxConcurrent) {
      return new Promise((resolve) => this.queue.push({ command, resolve }));
    }
    return ShellManager.getInstance().executeAsync(command);
  }
}
