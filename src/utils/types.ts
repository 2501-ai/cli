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
