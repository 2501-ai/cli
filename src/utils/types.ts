import { EngineCapability, FunctionAction } from '../helpers/api';

/**
 * @property {string} path - workspace path
 * @property {string} state_hash - hash of the workspace state
 * @property {Map<string, string>} file_hashes - Mappings of file paths to their md5 hashes
 */
export type WorkspaceState = {
  path: string;
  state_hash: string;
  file_hashes: Map<string, string>;
};

/**
 * @property {string} lineStart - starting line number for the update (required for update and remove)
 * @property {string|null} lineEnd - Optional ending line number (exclusive) for the update (required for update and remove)
 * @property {string|null} content - Optional content to replace or insert (if undefined, it removes the content)
 */
export type UpdateInstruction = {
  lineStart: number;
  lineEnd?: number | null;
  content?: string | null;
};

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
}

export type StreamEventStatus =
  | 'completed'
  | 'in_progress'
  | 'usage'
  | 'message'
  | 'chunked_message'
  | 'failed'
  | 'requires_action';

export type StreamEvent = {
  status: StreamEventStatus | null;
  message: string;
  actions?: FunctionAction[];
  usage?: UsageData;
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

export type Config = {
  workspace_disabled: boolean;
  api_key?: string;
  engine?: EngineType;
  stream?: boolean;
  agents: AgentConfig[];
};

export type AgentCallbackType = (...args: unknown[]) => Promise<void>;

export interface FunctionExecutionResult {
  output: string;
  tool_call_id: string;
  success: boolean;
}
