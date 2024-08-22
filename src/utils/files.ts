import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { WorkspaceState } from './types';
import { Logger } from './logger';
import { IGNORED_FILE_PATTERNS } from '../constants';
import { getWorkspaceFiles } from './workspace';

interface DirectoryMd5HashOptions {
  directoryPath: string;
  maxDepth?: number; // Optional parameter to limit directory depth
}

interface WorkspaceDiff {
  added: string[]; // Files that are present in the new state but not in the old state
  removed: string[]; // Files that are present in the old state but not in the new state
  modified: string[]; // Files that are present in both states but have different hashes
  hasChanges: boolean; // True if there are any changes in the workspace
}

/**
 * Get the list of files to ignore in the workspace, enriched with patterns from .gitignore if present.
 */
export function getIgnoredFiles(workspace: string): string[] {
  const ignorePatterns = new Set(IGNORED_FILE_PATTERNS);

  const hasGitIgnore = fs.existsSync(path.join(workspace, '.gitignore'));
  if (hasGitIgnore) {
    const gitIgnore = fs.readFileSync(
      path.join(workspace, '.gitignore'),
      'utf8'
    );
    gitIgnore
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.startsWith('#'))
      .map((v) => ignorePatterns.add(v));
  }

  return Array.from(ignorePatterns);
}

/**
 * Converts a byte size to a human-readable format.
 */
export const toReadableSize = (bytes: number) => {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Byte';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
};

/**
 * Computes the MD5 hash of a directory and its contents asynchronously based on file metadata.
 *
 * Returns a final directory hash and a HashMap of file paths to their respective hashes.
 * Limits the depth of traversal to avoid excessive resource usage in very deep directories.
 * Performance: Takes around 350ms on large codebases, 125ms on average.
 * @param options - Object containing the directory path and optional maxDepth for security.
 */
export async function getDirectoryMd5Hash({
  directoryPath,
  maxDepth = 10,
}: DirectoryMd5HashOptions) {
  const ignoreSet = new Set(getIgnoredFiles(directoryPath));
  Logger.debug('Directory:', directoryPath);

  // Start processing from the base directory with an initial depth of 0
  const result = await getWorkspaceFiles({
    currentPath: '',
    currentDepth: 0,
    ignoreSet,
    maxDepth,
    directoryPath,
  });

  Logger.debug(
    'Total size of files in directory:',
    toReadableSize(result.totalSize)
  );
  Logger.debug('Total files hashed:', result.fileHashes.size);

  // Sort the file paths to ensure consistent ordering for the final hash
  const sortedFileHashes = Array.from(result.fileHashes)
    .sort(([pathA], [pathB]) => pathA.localeCompare(pathB))
    .map(([relativePath, fileHash]) => `${fileHash}:${relativePath}`);

  // Concatenate all file hashes and compute the final directory hash
  const md5 = crypto
    .createHash('md5')
    .update(sortedFileHashes.join('|'))
    .digest('hex');

  return {
    md5,
    fileHashes: result.fileHashes,
    directoryPath,
    totalSize: result.totalSize,
  };
}

/**
 * Computes a hash based on file metadata (size and modification time).
 * This is a faster alternative to reading the entire file content, but will not detect changes in file content, and not detect reverted changes (for example)
 */
export function computeFileMetadataHash(filePath: string): {
  hash: string;
  size: number;
} {
  const stats = fs.statSync(filePath);
  const metaHash = crypto.createHash('md5');
  metaHash.update(`${stats.size}:${stats.mtimeMs}`);
  // Logger.debug(
  //   `Hashing metadata for file: ${filePath}`,
  //   `${stats.size}:${stats.mtimeMs}`
  // );
  return {
    hash: metaHash.digest('hex'),
    size: stats.size,
  };
}

/**
 * TODO: implement
 * Computes the difference between two workspace states.
 * @param oldState - The previous state of the workspace.
 * @param newState - The current state of the workspace.
 * @returns A WorkspaceDiff object containing arrays of added, removed, and modified files.
 */
export function getWorkspaceDiff(
  oldState: WorkspaceState,
  newState: WorkspaceState
): WorkspaceDiff {
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];

  // Check for added and modified files
  newState.file_hashes.forEach((newHash, filePath) => {
    if (!oldState.file_hashes.has(filePath)) {
      added.push(filePath);
    } else if (oldState.file_hashes.get(filePath) !== newHash) {
      modified.push(filePath);
    }
  });

  // Check for removed files
  oldState.file_hashes.forEach((_, filePath) => {
    if (!newState.file_hashes.has(filePath)) {
      removed.push(filePath);
    }
  });

  const hasChanges =
    added.length > 0 || removed.length > 0 || modified.length > 0;

  return { added, removed, modified, hasChanges };
}
