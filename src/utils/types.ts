/**
 * @property {string} path - workspace path
 * @property {string} state_hash - hash of the workspace state
 * @property {Map<string, string>} file_hashes - Mappings of file paths to their md5 hashes
 */
export interface WorkspaceState {
  path: string;
  state_hash: string;
  file_hashes: Map<string, string>;
  agent_id: string;
}

export interface DirectoryMd5Hash {
  md5: string;
  fileHashes: Map<string, string>;
  directoryPath: string;
  totalSize: number;
}

export interface Configuration {
  id: string;
  prompt: string;
  key: string;
  name: string;
  engine_type: string;
  owner_id: string;
}
/**
 * Represents the difference between two workspace states.
 * @property {string[]} added - Files that are present in the new state but not in the old state
 * @property {string[]} removed - Files that are present in the old state but not in the new state
 * @property {string[]} modified - Files that are present in both states but have different hashes
 * @property {boolean} hasChanges - True if there are any changes in the workspace
 */
export interface WorkspaceDiff {
  added: string[];
  removed: string[];
  modified: string[];
  hasChanges: boolean;
  isEmpty: boolean;
}

export type StreamEventStatus =
  | 'completed'
  | 'in_progress'
  | 'usage'
  | 'message'
  | 'chunked_message'
  | 'failed'
  | 'requires_action';

export type FunctionAction = {
  id: string; // ex: "call_fPPBsOHeRJGmpcZQeT3wRVTK",
  type: string; // ex: 'function'
  function:
    | {
        name: string; // ex: 'update_file';
        arguments: any;
      }
    | string; // ex: 'update_file';
  args: any;
};

export type QueryResponseDTO = {
  response?: string;
  actions?: FunctionAction[];
  prompt?: string;
};

/**
 * Collect system info while respecting privacy.
 */
export type SystemInfo = {
  sysInfo: {
    platform: string;
    os_info: string;
    installed_packages: Record<string, string>;
  };
  nodeInfo: {
    version: string;
    global_packages: string[];
  };
  pythonInfo?: {
    version: string;
  };
  phpInfo?: {
    version: string;
  };
};

export type StreamEvent = {
  status: StreamEventStatus | null;
  message: string;
  actions?: FunctionAction[];
  usage: UsageData | null;
  task_id?: string;
};

export type UsageData = {
  /**
   * Number of completion tokens used over the course of the run step.
   */
  completion_tokens: number;
  /**
   * Number of prompt tokens used over the course of the run step.
   */
  prompt_tokens: number;
  /**
   * Total number of tokens used (prompt + completion).
   */
  total_tokens: number;
};
export type EngineType = 'rhino' | 'rabbit';

export interface HostInfo {
  unique_id: string; // Matches Host.unique_id
  name?: string; // Matches Host.name
  private_ip?: string | null; // Optional, matches Host.private_ip
  additional_names?: string[]; // Optional, matches Host.additional_names
  mac?: string | null; // Optional, matches Host.mac
  public_ip?: string | null; // Optional, matches Host.public_ip
  public_ip_note?: string | null; // Optional, matches Host.public_ip_note
}

export interface RemoteExecConfig {
  enabled: boolean;
  target: string;
  port: number;
  type: (typeof REMOTE_EXEC_TYPES)[number]; // 'ssh' | 'winrm'
  platform: 'windows' | 'unix' | 'fortigate';
  user: string;
  password?: string;
  private_key?: string; // PEM key file path (password-protected)
  remote_workspace: string;
  raw_ssh?: boolean;
}

export interface CreateAgentResponse {
  id: string;
  name: string;
  workspace: string;
  engine: EngineType;
  configuration: string;
  host_id?: string; // Optional, matches Agent.host_id
  key?: string; // Matches Agent.key
  cli_data?: Record<string, any>; // Matches Agent.cli_data
  organization: {
    id: string;
    tenant_id: string;
  };
}

export interface GetAgentResponse {
  id: string;
  name: string;
  workspace: string;
  engine: EngineType;
  configuration: string;
  host_id?: string; // Optional, matches Agent.host_id
  key?: string; // Matches Agent.key
  cli_data?: Record<string, any>; // Matches Agent.cli_data
  // TODO: add remote_exec config from somewhere.
  status: 'idle' | 'running' | 'error';
  organization: {
    id: string;
    tenant_id: string;
  };
}

export interface AgentConfig {
  id: string;
  name: string;
  workspace: string;
  engine: EngineType;
  org_id: string;
  tenant_id: string;
  host_id: string;
  configuration: string;
  // Remote execution configuration (optional, per-agent)
  remote_exec?: RemoteExecConfig;
  // Remote workspace path (optional, per-agent)
  remote_workspace?: string;
}

export const REMOTE_EXEC_TYPES = ['ssh', 'winrm'] as const;

export type LocalConfig = {
  workspace_disabled: boolean;
  api_key?: string;
  engine: EngineType;
  stream?: boolean;
  agents: AgentConfig[];
  disable_spinner: boolean;
  telemetry_enabled: boolean;
  auto_update: boolean;
};

export type LocalConfigKey = keyof LocalConfig;

export type AgentCallbackType = (...args: unknown[]) => Promise<void>;

export interface FunctionExecutionResult {
  output: string;
  tool_call_id: string;
  success: boolean;
}

export interface PluginCommand {
  url: string;
  method: string;
  description: string;
  auth?: string;
  body?: Record<string, any>;
}

export interface Plugin {
  type: string;
  commands: PluginCommand[];
}

export interface PluginsConfig {
  [key: string]: Plugin;
}

export interface CredentialsConfig {
  [key: string]: {
    [key: string]: string;
  };
}
