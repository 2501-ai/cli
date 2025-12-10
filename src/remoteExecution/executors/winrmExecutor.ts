import { runCommand, runPowershell } from 'winrm-client';
import Logger from '../../utils/logger';
import { RemoteExecConfig } from '../../utils/types';
import { IRemoteExecutor } from '../remoteExecutor';

const WINDOWS_CMD_WRAPPER = 'powershell';
// Detection Logic
const HTTPS_PORTS = [443, 5986, 8443];

export class WinRMExecutor implements IRemoteExecutor {
  private static _instance: WinRMExecutor;
  private config: RemoteExecConfig | null = null;
  wrapper = WINDOWS_CMD_WRAPPER;

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

  isConnected(): boolean {
    return !!this.config?.enabled;
  }

  async connect(): Promise<void> {
    if (!this.config?.enabled) {
      throw new Error('Remote execution not configured');
    }

    const { target: host, user: username, password = '', port } = this.config;

    Logger.debug('Testing WinRM connection...');

    try {
      const isHttps = HTTPS_PORTS.includes(port);
      await runPowershell('$true', host, username, password, port, isHttps);
      Logger.debug('WinRM connection successful');
    } catch (error) {
      Logger.error('WinRM connection test failed:', error);
      throw new Error(`Failed to connect to WinRM host ${host}`);
    }
  }

  async executeCommand(
    command: string,
    stdin?: string,
    rawCmd = false
  ): Promise<string> {
    if (!this.config?.enabled) {
      throw new Error('Remote execution not configured');
    }

    if (stdin) {
      Logger.debug(
        'WinRM does not support stdin input, ignoring stdin parameter'
      );
    }

    const {
      target: host,
      port = 5985,
      user: username,
      password = '',
    } = this.config;

    Logger.debug('Executing WinRM command:', {
      host,
      port,
      username: username || '(not provided)',
      command: command.substring(0, 50) + (command.length > 50 ? '...' : ''),
    });

    try {
      // rawCmd: use runCommand for raw commands, runPowershell for PowerShell
      const result = rawCmd
        ? await runCommand(command, host, username, password, port)
        : await runPowershell(command, host, username, password, port);

      Logger.debug('WinRM command completed');
      return result || '';
    } catch (error) {
      Logger.error('WinRM command execution failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    // No explicit disconnect needed - winrm-client handles cleanup
    this.config = null;
    Logger.debug('WinRM executor reset');
  }
}
