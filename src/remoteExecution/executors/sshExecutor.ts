import fs from 'fs';
import path from 'path';
import os from 'os';
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
    stdin?: string,
    rawCmd = false,
    onPrompt?: (command: string, stdout: string) => Promise<string>
  ): Promise<string> {
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

        const finalCmd = rawCmd ? command : this.wrapper + command;
        // Use platform-appropriate command wrapper
        this.client.exec(finalCmd, (err, stream) => {
          if (err) {
            reject(err);
            return;
          }

          let stdout = '';
          let stderr = '';
          let isWaiting = false;
          let promptTimeout: NodeJS.Timeout | null = null;

          const checkForPrompt = () => {
            if (!onPrompt || isWaiting) return;

            // Clear existing timeout
            if (promptTimeout) {
              clearTimeout(promptTimeout);
            }

            // Set new timeout to detect if command is waiting for input
            promptTimeout = setTimeout(async () => {
              if (!isWaiting && onPrompt) {
                isWaiting = true;
                try {
                  const input = await onPrompt(command, stdout);
                  stream.stdin.write(input + '\n');
                  isWaiting = false;
                } catch (error) {
                  Logger.error(
                    'Failed to get input from prompt callback:',
                    error
                  );
                  reject(error);
                }
              }
            }, 5_000); // 5 seconds timeout for prompt detection
          };

          stream.on('close', (code: number) => {
            if (promptTimeout) {
              clearTimeout(promptTimeout);
            }
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
            Logger.debug('stdout:', { stdout });
            // Logger.debug('data:', { data: data.toString() });
            checkForPrompt();
          });

          stream.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
            checkForPrompt();
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
      this.client.destroy();
      this.client.removeAllListeners();
      this.client = null;
      this.connected = false;
      this.config = null;
    }
  }
}
