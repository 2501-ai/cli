import { runCommand } from 'nodejs-winrm';
import { ConfigManager } from './configManager';
import Logger from '../utils/logger';

export class WinRMExecutor {
  private static _instance: WinRMExecutor;

  static get instance() {
    if (!WinRMExecutor._instance) {
      WinRMExecutor._instance = new WinRMExecutor();
    }
    return WinRMExecutor._instance;
  }

  private constructor() {}

  async executeCommand(command: string): Promise<string> {
    try {
      const config = ConfigManager.instance;

      const result = await runCommand(
        command,
        config.get('remote_exec_target'),
        config.get('remote_exec_user'),
        config.get('remote_exec_password'),
        config.get('remote_exec_port')
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
