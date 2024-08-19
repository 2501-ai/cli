export type WorkspaceState = {
  path: string; // workspace path
  state_hash: string; // hash of the workspace state
  file_hashes: Map<string, string>; // Mappings of file paths to their md5 hashes
};
