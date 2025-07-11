import { UnixExecutor } from './executors/unixExecutor';
import { WinRMExecutor } from './executors/winrmExecutor';
import { AgentConfig } from '../utils/types';
import Logger from '../utils/logger';

interface IRemoteExecutor {
  init(agent: AgentConfig): void;
  executeCommand(command: string, stdin?: string): Promise<string>;
  validateConnection(): Promise<boolean>;
  disconnect?(): void;
}

export class RemoteExecutor {
  private static _instance: RemoteExecutor;
  private currentAgent: AgentConfig | null = null;
  private executor: IRemoteExecutor | null = null;

  static get instance() {
    if (!RemoteExecutor._instance) {
      RemoteExecutor._instance = new RemoteExecutor();
    }
    return RemoteExecutor._instance;
  }

  init(agent: AgentConfig): void {
    if (!agent.remote_exec || !agent.remote_exec.enabled) {
      throw new Error('Remote execution not configured for this agent');
    }

    // Initialize appropriate executor based on type
    if (agent.remote_exec.type === 'win') {
      this.executor = WinRMExecutor.instance;
    } else {
      this.executor = UnixExecutor.instance;
    }

    this.currentAgent = agent;
    this.executor.init(agent);

    Logger.debug(
      `Initialized ${agent.remote_exec.type} remote executor for agent: ${agent.id}`
    );
  }

  async executeCommand(command: string, stdin?: string): Promise<string> {
    if (!this.executor || !this.currentAgent) {
      throw new Error('Remote executor not initialized. Call init() first.');
    }

    Logger.debug(`Executing remote command: ${command}`);
    return this.executor.executeCommand(command, stdin);
  }

  async validateConnection(): Promise<boolean> {
    if (!this.executor || !this.currentAgent) {
      throw new Error('Remote executor not initialized. Call init() first.');
    }

    Logger.debug(`Validating connection for agent: ${this.currentAgent.id}`);
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
    this.currentAgent = null;
    Logger.debug('Remote executor disconnected');
  }

  isInitialized(): boolean {
    return this.executor !== null && this.currentAgent !== null;
  }

  getCurrentAgent(): AgentConfig | null {
    return this.currentAgent;
  }

  getExecutorType(): 'unix' | 'win' | null {
    return this.currentAgent?.remote_exec?.type || null;
  }
}
