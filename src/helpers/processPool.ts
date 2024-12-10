import { ShellProcess, ShellManager } from '../managers/shellManager';

interface ProcessPoolConfig {
  maxConcurrent: number;
  timeout: number;
}

const config: ProcessPoolConfig = {
  maxConcurrent: 5,
  timeout: 1000,
};
// TODO: might not be needed.
export class ProcessPool {
  private running: Set<string> = new Set();
  private queue: Array<{
    command: string;
    resolve: (value: PromiseLike<ShellProcess>) => void;
  }> = [];

  async execute(
    commands: string[],
    workspace: string
  ): Promise<Map<number, any>> {
    const results = new Map<number, any>();

    for (const cmd of commands) {
      const { pid } = await this.scheduleCommand(cmd);
      results.set(
        pid,
        await ShellManager.instance.getShellprocess(pid, workspace)
      );
    }

    return results;
  }

  private async scheduleCommand(command: string): Promise<ShellProcess> {
    if (this.running.size >= config.maxConcurrent) {
      return new Promise((resolve) => this.queue.push({ command, resolve }));
    }
    return ShellManager.instance.executeAsync(command);
  }
}
