import { Command, Shell, monitorCommandOutput } from 'winrm-client';
import Logger from '../../utils/logger';
import { ExecutionResult, IRemoteExecutor, RemoteExecConfig } from '../types';
import { debouncePromptCheck } from '../core/prompt-detector';
import { OutputBuffer } from '../core/output-buffer';

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
      this.disconnect();
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
      const shellId = await Shell.doCreateShell({
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
    rawCmd = false,
    stdin?: string,
    onPrompt?: (command: string, stdout: string) => Promise<string>
  ): Promise<ExecutionResult> {
    try {
      await this.connect();

      if (!this.session) {
        throw new Error('WinRM session not initialized');
      }

      // Note: stdin is not supported in WinRM like it is in SSH
      if (stdin) {
        Logger.warn(
          'WinRM does not support stdin input, ignoring stdin parameter'
        );
      }

      if (command.includes('powershell -Command')) {
        rawCmd = true;
      }

      const escapedCommand = command.replace(/"/g, '""'); // Escape double quotes for PowerShell
      const wrappedCommand = rawCmd
        ? command
        : `${this.wrapper}"${escapedCommand}"`; // Wrap in double quotes

      const cmdId = await Command.doExecuteCommand({
        ...this.session,
        command: wrappedCommand,
      });

      Logger.debug('WinRM command executed:', {
        cmdId,
        wrappedCommand,
      });

      const asyncDetector = async (output: string) => {
        if (!onPrompt) {
          throw new Error('No onPrompt function provided');
        }

        Logger.debug('WinRM interactive command output:', output);
        const result = await new Promise<string>((resolve) => {
          const onPromptDetected = async () => {
            resolve(await onPrompt(command, output));
          };
          debouncePromptCheck(OutputBuffer.from(output), onPromptDetected);
        });

        return result;
      };

      const output = await monitorCommandOutput({
        ...this.session,
        commandId: cmdId,
        executionTimeout: 5 * 60 * 1000, // 5 minutes
        prompts: [{ asyncDetector }],
      });

      Logger.debug('WinRM command result:', {
        wrappedCommand,
        cmdId,
        result: output,
      });

      return {
        stdout: output || '',
      };
    } catch (error) {
      Logger.error('WinRM command execution failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.session) {
      await Shell.doDeleteShell(this.session);
      Logger.debug('WinRM connection closed');
    }
    this.session = null;
    this.connected = false;
    this.config = null;
  }
}
