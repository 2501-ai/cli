import { runCommand } from 'nodejs-winrm';
import Logger from '../../utils/logger';
import { RemoteExecConfig } from '../../utils/types';
import { IRemoteExecutor } from '../remoteExecutor';

export class WinRMExecutor implements IRemoteExecutor {
  private static _instance: WinRMExecutor;
  private config: RemoteExecConfig | null = null;

  static get instance() {
    if (!WinRMExecutor._instance) {
      WinRMExecutor._instance = new WinRMExecutor();
    }
    return WinRMExecutor._instance;
  }

  private constructor() {}

  init(config: RemoteExecConfig): void {
    this.config = config;
  }

  async executeCommand(command: string): Promise<string> {
    try {
      if (!this.config || !this.config.enabled) {
        throw new Error('Remote execution not configured for this agent');
      }

      const result = await runCommand(
        command,
        this.config.target,
        this.config.user,
        this.config.password || '',
        this.config.port
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
