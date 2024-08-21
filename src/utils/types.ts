export type WorkspaceState = {
  path: string; // workspace path
  state_hash: string; // hash of the workspace state
  file_hashes: Map<string, string>; // Mappings of file paths to their md5 hashes
};

export type UpdateInstruction = {
  lineStart?: number | null; // Optional starting line number for the update (required for update and remove)
  lineEnd?: number | null; // Optional ending line number (exclusive) for the update (required for update and remove)
  content?: string | null; // New content to replace or insert (if undefined, it removes the content)
};
