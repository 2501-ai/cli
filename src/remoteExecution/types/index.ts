export const REMOTE_EXEC_TYPES = ['ssh', 'winrm'] as const;

export interface RemoteExecConfig {
  enabled: boolean;
  target: string;
  port: number;
  type: (typeof REMOTE_EXEC_TYPES)[number]; // 'ssh' | 'winrm'
  platform: 'windows' | 'unix';
  user: string;
  password?: string;
  private_key?: string; // PEM key file path (password-protected)
  remote_workspace: string;
}

export interface IRemoteExecutor {
  init(config: RemoteExecConfig): void;

  executeCommand(
    command: string,
    rawCmd?: boolean,
    stdin?: string,
    onPrompt?: (command: string, stdout: string) => Promise<string>,
    detectPrompt?: (content: string) => Promise<boolean>
  ): Promise<ExecutionResult>;

  disconnect?(): Promise<void>;

  connect(): Promise<void>;

  isConnected(): boolean;

  wrapper?: string;
}

export interface SSHConfig {
  host: string;
  username: string;
  password?: string;
  privateKey?: string;
  port?: number;
  enabled: boolean;
}

export interface PromptDetectionResult {
  isPrompt: boolean;
  confidence: number;
  reasons: string[];
  method: 'pattern' | 'combined' | 'ml';
}

export interface ExecutionResult {
  stdout: string;
  stderr?: string;
  exitCode?: number;
}

export type PromptCallback = (
  command: string,
  stdout: string,
  stderr: string
) => Promise<string>;
