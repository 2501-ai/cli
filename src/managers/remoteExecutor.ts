import { Client, ConnectConfig } from 'ssh2';
import { ConfigManager } from './configManager';
import Logger from '../utils/logger';

export class RemoteExecutor {
  private static _instance: RemoteExecutor;
  private client: Client | null = null;
  private isConnected = false;

  static get instance() {
    if (!RemoteExecutor._instance) {
      RemoteExecutor._instance = new RemoteExecutor();
    }
    return RemoteExecutor._instance;
  }

  private getConnectionConfig(): ConnectConfig {
    const config = ConfigManager.instance;

    const connectionConfig: ConnectConfig = {
      host: config.get('remote_exec_target'),
      port: config.get('remote_exec_port'),
      username: config.get('remote_exec_user'),
      password: config.get('remote_exec_password'),
      //   debug: (message: string) => Logger.debug(message),
    };

    // Add private key if specified
    const privateKeyPath = config.get('remote_exec_private_key');
    if (privateKeyPath) {
      Logger.debug('Using private key:', privateKeyPath);
      const fs = require('fs');
      connectionConfig.privateKey = fs.readFileSync(privateKeyPath);
    }

    return connectionConfig;
  }

  private async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.client = new Client();

      this.client.on('ready', () => {
        this.isConnected = true;
        Logger.debug('SSH connection established');
        resolve();
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        Logger.debug('SSH connection error:', err);
        reject(err);
      });

      this.client.on('close', () => {
        this.isConnected = false;
        Logger.debug('SSH connection closed');
      });

      const connectionConfig = this.getConnectionConfig();
      this.client.connect(connectionConfig);
    });
  }

  async executeCommand(command: string, stdin?: string): Promise<string> {
    try {
      await this.connect();

      return new Promise((resolve, reject) => {
        if (!this.client) {
          reject(new Error('SSH client not initialized'));
          return;
        }

        this.client.exec(command, (err, stream) => {
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
              resolve(stdout);
            }
          });

          stream.on('data', (data: Buffer) => {
            stdout += data.toString();
          });

          stream.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });

          if (stdin) {
            Logger.debug('Writing content to stdin:', { content: stdin });
            // Write the content to the stdin of the stream.
            stream.stdin.write(stdin);

            // End the stdin of the stream.
            stream.stdin.end();
          }
        });
      });
    } catch (error) {
      Logger.error('Remote command execution failed:', error);
      throw error;
    }
  }

  disconnect(): void {
    if (this.client) {
      this.client.end();
      this.client = null;
      this.isConnected = false;
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      const result = await this.executeCommand('echo "connection_test"');
      this.disconnect();
      return result.trim() === 'connection_test';
    } catch (error) {
      Logger.error('Connection validation failed:', error);
      return false;
    }
  }
}
