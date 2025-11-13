import winrm from 'nodejs-winrm';
import Logger from '../../utils/logger';
import { RemoteExecConfig } from '../../utils/types';
import { IRemoteExecutor } from '../remoteExecutor';

// Powershell is the default command wrapper for winrm
// A space is left at the end for the command concatenation.
const WINDOWS_CMD_WRAPPER = 'powershell -Command ';

interface WinRMSession {
  shellId: string;
  host: string;
  port: number;
  auth: string;
  path: string;
}

export class WinRMExecutor implements IRemoteExecutor {
  private static _instance: WinRMExecutor;
  private config: RemoteExecConfig | null = null;
  private connected = false;
  private session: WinRMSession | null = null;
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
    this.session = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private getConnectionConfig() {
    if (!this.config || !this.config.enabled) {
      throw new Error('Remote execution not configured for this agent');
    }

    return {
      host: this.config.target,
      port: this.config.port || 5985,
      username: this.config.user,
      password: this.config.password || '',
    };
  }

  async connect(): Promise<void> {
    if (!this.config || !this.config.enabled) {
      throw new Error('Remote execution not configured');
    }

    // If already connected to the same agent, return
    if (
      this.connected &&
      this.session &&
      this.config.target === this.config.target
    ) {
      return;
    }

    // Disconnect from previous connection if different agent
    if (this.connected && this.config.target !== this.config.target) {
      this.disconnect().catch((error) => {
        Logger.error('Error disconnecting from WinRM executor:', error);
      });
    }

    try {
      const connectionConfig = this.getConnectionConfig();

      const auth =
        'Basic ' +
        Buffer.from(
          connectionConfig.username + ':' + connectionConfig.password,
          'utf8'
        ).toString('base64');

      Logger.debug('Connection Params:', {
        auth,
        username: (connectionConfig.username && '***') || '(not provided)',
        password: (connectionConfig.password && '***') || '(not provided)',
        host: connectionConfig.host,
        port: connectionConfig.port,
        path: '/wsman',
      });

      // Connect
      const shellId = await winrm.shell.doCreateShell({
        host: connectionConfig.host,
        port: connectionConfig.port,
        auth,
        path: '/wsman',
      });

      this.session = {
        shellId,
        host: connectionConfig.host,
        port: connectionConfig.port,
        auth,
        path: '/wsman',
      };

      this.connected = true;
      Logger.debug('WinRM connection established');
    } catch (error) {
      this.connected = false;
      Logger.debug('WinRM connection error:', error);
      throw error;
    }
  }

  async executeCommand(
    command: string,
    stdin?: string,
    rawCmd = false
  ): Promise<string> {
    try {
      await this.connect();

      if (!this.session) {
        throw new Error('WinRM session not initialized');
      }

      // Note: stdin is not supported in WinRM like it is in SSH
      if (stdin) {
        Logger.debug(
          'WinRM does not support stdin input, ignoring stdin parameter'
        );
      }

      const escapedCommand = command.replace(/"/g, '""'); // Escape double quotes for PowerShell
      const wrappedCommand = rawCmd
        ? command
        : `${this.wrapper}"${escapedCommand}"`; // Wrap in double quotes

      const cmdId = await winrm.command.doExecuteCommand({
        ...this.session,
        command: wrappedCommand,
      });

      const result = await winrm.command.doReceiveOutput({
        ...this.session,
        commandId: cmdId,
      });

      Logger.debug('WinRM command result:', {
        wrappedCommand,
        cmdId,
        result,
      });

      return result || '';
    } catch (error) {
      Logger.error('WinRM command execution failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.session) {
      await winrm.shell.doDeleteShell(this.session);
      Logger.debug('WinRM connection closed');
    }
    this.session = null;
    this.connected = false;
    this.config = null;
  }
}
