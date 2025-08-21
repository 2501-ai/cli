import fs from 'fs';
import path from 'path';
import os from 'os';
import { Client, ConnectConfig } from 'ssh2';
import Logger from '../../utils/logger';
import {
  ExecutionResult,
  IRemoteExecutor,
  PromptCallback,
  RemoteExecConfig,
} from '../types';
import {
  clearAllPromptTimeouts,
  debouncePromptCheck,
} from '../core/prompt-detector';
import { OutputBuffer } from '../core/output-buffer';

const UNIX_COMMAND_WRAPPER = `source ~/.bashrc 2>/dev/null || true; source ~/.profile 2>/dev/null || true; source ~/.nvm/nvm.sh 2>/dev/null || true;`;
const WINDOWS_CMD_WRAPPER = 'powershell ';

export class SSHExecutor implements IRemoteExecutor {
  private static _instance: SSHExecutor;
  private client: Client | null = null;
  private connected = false;
  private config: RemoteExecConfig | null = null;
  wrapper: string = '';

  static get instance() {
    if (!SSHExecutor._instance) {
      SSHExecutor._instance = new SSHExecutor();
    }
    return SSHExecutor._instance;
  }

  init(config: RemoteExecConfig): void {
    this.config = config;
    this.client = null;
    this.connected = false;
    this.wrapper =
      config.platform === 'windows'
        ? WINDOWS_CMD_WRAPPER
        : UNIX_COMMAND_WRAPPER;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private getConnectionConfig(): ConnectConfig {
    if (!this.config || !this.config.enabled) {
      throw new Error('Remote execution not configured for this agent');
    }

    const connectionConfig: ConnectConfig = {
      host: this.config.target,
      port: this.config.port,
      username: this.config.user,
      // debug: (message: string) => Logger.debug(message),
    };

    // Handle authentication methods - try multiple methods for better compatibility
    // 1. PEM private key (private_key, pem, rsa)
    if (this.config.private_key) {
      Logger.debug('Using PEM private key:', this.config.private_key);
      connectionConfig.privateKey = fs.readFileSync(this.config.private_key);
      if (this.config.password) {
        connectionConfig.passphrase = this.config.password;
      }
    }

    // 2. RSA private key (default ~/.ssh/id_rsa)
    const rsaKeyPath = path.join(os.homedir(), '.ssh', 'id_rsa');
    if (!connectionConfig.privateKey && fs.existsSync(rsaKeyPath)) {
      Logger.debug('Using RSA private key:', rsaKeyPath);
      connectionConfig.privateKey = fs.readFileSync(rsaKeyPath);
    }

    // 3. Password authentication
    if (this.config.password) {
      Logger.debug('Using password authentication');
      connectionConfig.password = this.config.password;
    }

    return connectionConfig;
  }

  async connect(): Promise<void> {
    if (!this.config || !this.config.enabled) {
      throw new Error('Remote execution not configured');
    }

    // If already connected to the same agent, return
    if (
      this.connected &&
      this.client &&
      this.config.target === this.config.target
    ) {
      return;
    }

    // Disconnect from previous connection if different agent
    if (this.connected && this.config.target !== this.config.target) {
      this.disconnect();
    }

    return new Promise((resolve, reject) => {
      this.client = new Client({
        captureRejections: true,
      });

      this.client.on('ready', () => {
        this.connected = true;
        Logger.debug('SSH connection established');
        resolve();
      });

      this.client.on('error', (err) => {
        this.connected = false;
        Logger.debug('SSH connection error:', err);
        reject(err);
      });

      this.client.on('close', () => {
        this.connected = false;
        Logger.debug('SSH connection closed');
      });

      const connectionConfig = this.getConnectionConfig();
      this.client.connect(connectionConfig);
    });
  }

  async executeCommand(
    command: string,
    rawCmd = false,
    stdin?: string,
    onPrompt?: PromptCallback
  ): Promise<ExecutionResult> {
    await this.connect();

    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('Not connected to SSH'));
        return;
      }

      const finalCommand = rawCmd ? command : this.wrapper + command;
      this.client.exec(finalCommand, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        const outputBuffer = new OutputBuffer();
        let isWaitingForPrompt = false;

        const handlePrompt = async () => {
          if (isWaitingForPrompt || !onPrompt) return;

          isWaitingForPrompt = true;

          try {
            const stdout = outputBuffer.getBuffer();
            const stderr = outputBuffer.getStderrBuffer();
            const input = await onPrompt(command, stdout, stderr);

            stream.stdin.write(input + '\n');
            isWaitingForPrompt = false;
          } catch (error) {
            reject({
              stdout: outputBuffer.getBuffer(),
              stderr: outputBuffer.getStderrBuffer(),
              exitCode: -1,
            } as ExecutionResult);
          }
        };

        stream.on('close', (code: number) => {
          clearAllPromptTimeouts();

          const stdout = outputBuffer.getBuffer();
          const stderr = outputBuffer.getStderrBuffer();

          if (code !== 0) {
            reject({
              stdout,
              stderr: `Command failed with exit code ${code}: ${stderr}`,
              exitCode: code,
            } as ExecutionResult);
          } else {
            resolve({
              stdout,
              stderr,
              exitCode: code,
            } as ExecutionResult);
          }
        });

        stream.stdout.on('data', (data: Buffer) => {
          outputBuffer.append(data.toString());
          debouncePromptCheck(outputBuffer, handlePrompt);
        });

        stream.stderr.on('data', (data: Buffer) => {
          outputBuffer.append(data.toString(), true);
          debouncePromptCheck(outputBuffer, handlePrompt);
        });

        if (stdin) {
          stream.stdin.write(stdin + '\n');
          stream.stdin.end();
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.end();
      this.client.destroy();
      this.client.removeAllListeners();
      this.client = null;
      this.connected = false;
      this.config = null;
    }
  }
}
