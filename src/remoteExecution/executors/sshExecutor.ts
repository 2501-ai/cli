import { Client, ConnectConfig } from 'ssh2';
import Logger from '../../utils/logger';
import { RemoteExecConfig } from '../../utils/types';
import { IRemoteExecutor } from '../remoteExecutor';

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
      password: this.config.password,
      // debug: (message: string) => Logger.debug(message),
    };
    // Add private key if specified
    if (this.config.private_key) {
      Logger.debug('Using private key:', this.config.private_key);
      const fs = require('fs');
      connectionConfig.privateKey = fs.readFileSync(this.config.private_key);
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

  async executeCommand(command: string, stdin?: string): Promise<string> {
    try {
      await this.connect();

      if (!this.config || !this.config.enabled) {
        throw new Error('Remote execution not configured');
      }

      return new Promise((resolve, reject) => {
        if (!this.client) {
          reject(new Error('SSH client not initialized'));
          return;
        }

        // Use platform-appropriate command wrapper
        this.client.exec(this.wrapper + command, (err, stream) => {
          if (err) {
            reject(err);
            return;
          }

          let stdout = '';
          let stderr = '';

          stream.on('close', (code: number) => {
            if (code !== 0) {
              reject(
                new Error(`Command failed with exit code ${code}: ${stderr}`)
              );
            } else {
              // Remove the command wrapper from the output if used
              const result = stdout.replace(this.wrapper, '').trim();
              resolve(result);
            }
          });

          stream.on('data', (data: Buffer) => {
            stdout += data.toString();
          });

          stream.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });

          if (stdin) {
            stream.stdin.write(stdin);
            stream.stdin.end();
          }
        });
      });
    } catch (error) {
      Logger.error('Remote command execution failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.end();
      this.client = null;
      this.connected = false;
      this.config = null;
    }
  }
}
