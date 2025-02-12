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

export type EngineCapability = 'stream' | 'async';

export type QueryResponseDTO = {
  asynchronous: boolean;
  capabilities: EngineCapability[]; // async, stream, submit_output
  response?: string;
  actions?: FunctionAction[];
  prompt?: string;
};

/**
 * Collect system info while respecting privacy.
 */
export type SystemInfo = {
  sysInfo: {
    platform: NodeJS.Platform;
    type: string;
    release: string;
    arch: string;
    package_manager: string;
    installed_packages: string[];
  };
  nodeInfo: {
    version: string;
    config: NodeJS.ProcessConfig;
    global_packages: string[];
  };
};

export type StreamEvent = {
  status: StreamEventStatus | null;
  message: string;
  actions?: FunctionAction[];
  usage: UsageData | null;
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

export interface AgentConfig {
  id: string;
  name: string;
  workspace: string;
  engine: EngineType;
  configuration: string;
  capabilities: EngineCapability[];
}

export type LocalConfig = {
  workspace_disabled: boolean;
  api_key?: string;
  engine?: EngineType;
  stream?: boolean;
  agents: AgentConfig[];
  join_discord_shown: boolean;
};

export type AgentCallbackType = (...args: unknown[]) => Promise<void>;

export interface FunctionExecutionResult {
  output: string;
  tool_call_id: string;
  success: boolean;
}
