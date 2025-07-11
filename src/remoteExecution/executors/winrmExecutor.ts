import { runCommand } from 'nodejs-winrm';
import Logger from '../../utils/logger';
import { AgentConfig } from '../../utils/types';

export class WinRMExecutor {
  private static _instance: WinRMExecutor;
  private currentAgent: AgentConfig | null = null;

  static get instance() {
    if (!WinRMExecutor._instance) {
      WinRMExecutor._instance = new WinRMExecutor();
    }
    return WinRMExecutor._instance;
  }

  private constructor() {}

  init(agent: AgentConfig): void {
    this.currentAgent = agent;
  }

  async executeCommand(command: string): Promise<string> {
    try {
      if (
        !this.currentAgent?.remote_exec ||
        !this.currentAgent?.remote_exec.enabled
      ) {
        throw new Error('Remote execution not configured for this agent');
      }

      const result = await runCommand(
        command,
        this.currentAgent.remote_exec.target,
        this.currentAgent.remote_exec.user,
        this.currentAgent.remote_exec.password || '',
        this.currentAgent.remote_exec.port
      );

      return result || '';
    } catch (error) {
      Logger.error('WinRM command execution failed:', error);
      throw error;
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      const result = await this.executeCommand('echo connection_test');
      return result.trim() === 'connection_test';
    } catch (error) {
      Logger.error('WinRM connection validation failed:', error);
      return false;
    }
  }
}
