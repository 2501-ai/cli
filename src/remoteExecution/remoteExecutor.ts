import { UnixExecutor } from './executors/unixExecutor';
import { WinRMExecutor } from './executors/winrmExecutor';
import { RemoteExecConfig } from '../utils/types';
import Logger from '../utils/logger';

export interface IRemoteExecutor {
  init(config: RemoteExecConfig): void;
  executeCommand(command: string, stdin?: string): Promise<string>;
  validateConnection(): Promise<boolean>;
  disconnect?(): void;
}

export class RemoteExecutor {
  private static _instance: RemoteExecutor;
  private config: RemoteExecConfig | null = null;
  private executor: IRemoteExecutor | null = null;

  static get instance() {
    if (!RemoteExecutor._instance) {
      RemoteExecutor._instance = new RemoteExecutor();
    }
    return RemoteExecutor._instance;
  }

  init(config: RemoteExecConfig): void {
    if (!config || !config.enabled) {
      throw new Error('Remote execution not configured');
    }

    // Initialize appropriate executor based on type
    if (config.type === 'win') {
      this.executor = WinRMExecutor.instance;
    } else {
      this.executor = UnixExecutor.instance;
    }

    this.config = config;
    this.executor.init(config);

    Logger.debug(`Initialized ${config.type} remote executor.`);
  }

  async executeCommand(command: string, stdin?: string): Promise<string> {
    if (!this.executor || !this.config) {
      throw new Error('Remote executor not initialized. Call init() first.');
    }

    Logger.debug(`Executing remote command: ${command}`);
    return this.executor.executeCommand(command, stdin);
  }

  async validateConnection(): Promise<boolean> {
    if (!this.executor || !this.config) {
      throw new Error('Remote executor not initialized. Call init() first.');
    }

    Logger.debug(`Validating connection for host: ${this.config.target}`);
    return this.executor.validateConnection();
  }

  disconnect(): void {
    if (
      this.executor &&
      'disconnect' in this.executor &&
      this.executor.disconnect
    ) {
      this.executor.disconnect();
    }
    this.executor = null;
    this.config = null;
    Logger.debug('Remote executor disconnected');
  }

  isInitialized(): boolean {
    return this.executor !== null && this.config !== null;
  }

  getConfig(): RemoteExecConfig {
    if (!this.executor || !this.config) {
      throw new Error('Remote executor not initialized. Call init() first.');
    }
    return this.config;
  }

  getExecutorType(): 'unix' | 'win' {
    if (!this.executor || !this.config) {
      throw new Error('Remote executor not initialized. Call init() first.');
    }
    return this.config?.type || null;
  }
}
