import { listAgentsFromWorkspace } from '../utils/conf';
import Logger from '../utils/logger';
import { RemoteExecConfig } from '../utils/types';
import { SSHExecutor } from './executors/sshExecutor';
import { WinRMExecutor } from './executors/winrmExecutor';

export interface IRemoteExecutor {
  init(config: RemoteExecConfig): void;

  executeCommand(command: string, stdin?: string): Promise<string>;

  disconnect?(): Promise<void>;

  connect(): Promise<void>;

  isConnected(): boolean;

  wrapper?: string;
}

export class RemoteExecutor {
  private static _instance: RemoteExecutor;
  protected config: RemoteExecConfig | null = null;
  protected executor: IRemoteExecutor | null = null;

  static get instance() {
    if (!RemoteExecutor._instance) {
      RemoteExecutor._instance = new RemoteExecutor();
    }
    return RemoteExecutor._instance;
  }

  get isConnected(): boolean {
    return this.executor?.isConnected() ?? false;
  }

  init(config: RemoteExecConfig, workspacePath: string): boolean {
    if (!config || !config.enabled) {
      throw new Error('Remote config is not enabled');
    }

    const agents = listAgentsFromWorkspace(workspacePath);

    if (agents.length > 0) {
      return false;
    }

    // Initialize appropriate executor based on connection type
    if (config.type === 'winrm') {
      this.executor = WinRMExecutor.instance;
    } else if (config.type === 'ssh') {
      this.executor = SSHExecutor.instance;
    } else {
      throw new Error(`Unsupported remote execution type: ${config.type}`);
    }

    this.config = config;
    this.executor.init(config);

    Logger.debug(
      `Initialized ${config.type} remote executor for ${config.target}:${config.port}`
    );

    return true;
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

  private throwIfNotInitialized(): asserts this is RemoteExecutor & {
    executor: IRemoteExecutor;
    config: RemoteExecConfig;
  } {
    if (!this.isConfigured()) {
      throw new Error(`Remote executor not initialized. Call init() first.`);
    }
  }

  async executeCommand(command: string, stdin?: string): Promise<string> {
    this.throwIfNotInitialized();

    Logger.debug(`Executing remote command: ${command}`);
    return this.executor.executeCommand(command, stdin);
  }

  async validateConnection(): Promise<boolean> {
    this.throwIfNotInitialized();

    Logger.debug(`Validating connection for host: ${this.config.target}`);
    return (await this.detectRemotePlatform()) !== null;
  }

  async detectRemotePlatform(): Promise<'windows' | 'unix' | null> {
    this.throwIfNotInitialized();

    await this.connect(); // initialize the connection to the remote host

    if (this.config.type === 'winrm') {
      this.config.platform = 'windows';
      return 'windows';
    }

    try {
      this.executor.wrapper = '';
      const result = await this.executeCommand('uname -s 2>&1 || ver');

      Logger.debug('Platform detection result:', result);

      // Check if the output contains Windows indicators
      if (
        result.toLowerCase().includes('windows') ||
        result.toLowerCase().includes('microsoft')
      ) {
        this.config.platform = 'windows';
        return 'windows';
      }

      // If uname succeeded, it's Unix-like (Linux, macOS, etc.)
      if (
        result.includes('Linux') ||
        result.includes('Darwin') ||
        result.includes('FreeBSD')
      ) {
        this.config.platform = 'unix';
        return 'unix';
      }

      // Default to unix if unclear
      Logger.debug(
        'Platform detection unclear, defaulting to unix. Result:',
        result
      );
      this.config.platform = 'unix';
      return 'unix';
    } catch (error) {
      Logger.debug('Platform detection failed:', error);
      return null;
    }
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
    this.throwIfNotInitialized();
    await this.executor.connect();
  }

  getConfig(): RemoteExecConfig {
    this.throwIfNotInitialized();
    return this.config;
  }
}
