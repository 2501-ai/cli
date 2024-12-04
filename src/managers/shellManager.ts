import execa from 'execa';

export interface ShellProcess {
  id: string;
  command: string;
  status: 'running' | 'completed' | 'failed';
  pid?: number;
  output: string;
  startTime: Date;
}

export class ShellManager {
  static _instance?: ShellManager;
  static getInstance() {
    if (!ShellManager._instance) {
      ShellManager._instance = new ShellManager();
    }
    return ShellManager._instance;
  }

  private processes: Map<string, ShellProcess> = new Map();

  async executeAsync(command: string): Promise<string> {
    let processId = crypto.randomUUID();
    const process = execa(command, {
      shell: true,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    processId = process.pid?.toString() || processId;

    this.processes.set(processId, {
      id: processId,
      command,
      status: 'running',
      pid: process.pid,
      output: '',
      startTime: new Date(),
    });

    // Stream handling
    process.stdout?.on('data', (data) => {
      const proc = this.processes.get(processId);
      if (proc) {
        proc.output += data.toString();
      }
    });

    return processId;
  }

  getStatus(processId: string): ShellProcess | null {
    return this.processes.get(processId) || null;
  }
  getAllProcesses() {
    return Array.from(this.processes.values());
  }
}
