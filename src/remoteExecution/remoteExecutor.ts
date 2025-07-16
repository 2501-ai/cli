import { UnixExecutor } from './executors/unixExecutor';
import { WinRMExecutor } from './executors/winrmExecutor';
import { RemoteExecConfig } from '../utils/types';
import Logger from '../utils/logger';

export interface IRemoteExecutor {
  init(config: RemoteExecConfig): void;
  executeCommand(command: string, stdin?: string): Promise<string>;
  validateConnection(): Promise<boolean>;
  disconnect?(): Promise<void>;
  connect(): Promise<void>;
  isConnected(): boolean;
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

  get isConnected(): boolean {
    return this.executor?.isConnected() ?? false;
  }

  init(config: RemoteExecConfig): void {
    if (!config || !config.enabled) {
      throw new Error('Remote config is not enabled');
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

  /**
   * @returns true if the remote executor is configured.
   */
  isConfigured(): boolean {
    return this.executor !== null && this.config !== null;
  }

  /**
   * @returns true if the remote executor is initialized and enabled.
   */
  isEnabled(): boolean {
    return (this.isConfigured() && this.config?.enabled) ?? false;
  }

  private throwIfNotInitialized(method: string): void {
    if (!this.isConfigured()) {
      throw new Error(
        `[${method}] Remote executor not initialized. Call init() first.`
      );
    }
  }

  async executeCommand(command: string, stdin?: string): Promise<string> {
    this.throwIfNotInitialized('executeCommand');

    Logger.debug(`Executing remote command: ${command}`);
    return this.executor!.executeCommand(command, stdin);
  }

  async validateConnection(): Promise<boolean> {
    this.throwIfNotInitialized('validateConnection');

    Logger.debug(`Validating connection for host: ${this.config!.target}`);
    return this.executor!.validateConnection();
  }

  async disconnect(): Promise<void> {
    if (
      this.executor &&
      'disconnect' in this.executor &&
      this.executor.disconnect
    ) {
      await this.executor.disconnect();
      Logger.debug('Remote executor disconnected');
    }
    this.executor = null;
    this.config = null;
  }

  async connect(): Promise<void> {
    this.throwIfNotInitialized('connect');
    await this.executor?.connect();
  }

  getConfig(): RemoteExecConfig {
    this.throwIfNotInitialized('getConfig');
    return this.config!;
  }

  getExecutorType(): 'unix' | 'win' {
    this.throwIfNotInitialized('getExecutorType');
    return this.config!.type;
  }
}
