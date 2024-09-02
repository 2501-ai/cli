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

export type StreamEventTypes =
  | 'in_progress'
  | 'failed'
  | 'completed'
  | 'requires_action';

export type StreamEvent = {
  event: StreamEventTypes;
  data: any;
};
