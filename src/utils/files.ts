import path from 'path';
import crypto from 'crypto';
import { IGNORED_FILE_PATTERNS } from './workspace';
import fs from 'fs';
import { WorkspaceState } from './types';
import { Logger } from './logger';

/**
 * Options for computing the MD5 hash of a directory and its contents.
 * @property {string} directoryPath - The path of the directory to hash
 * @property {number} [maxDepth=10] - The maximum depth to traverse for directory contents
 * @property {string[]} [ignorePatterns] - An array of patterns or names to ignore
 */
interface DirectoryMd5HashOptions {
  directoryPath: string;
  maxDepth?: number;
  ignorePatterns?: string[];
}

/**
 * Represents the difference between two workspace states.
 * @property {string[]} added - Files that are present in the new state but not in the old state
 * @property {string[]} removed - Files that are present in the old state but not in the new state
 * @property {string[]} modified - Files that are present in both states but have different hashes
 * @property {boolean} hasChanges - True if there are any changes in the workspace
 */
interface WorkspaceDiff {
  added: string[];
  removed: string[];
  modified: string[];
  hasChanges: boolean;
}

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
  ignorePatterns = IGNORED_FILE_PATTERNS,
}: DirectoryMd5HashOptions) {
  const fileHashes = new Map<string, string>();
  const ignoreSet = new Set(ignorePatterns);

  async function processDirectory(
    currentPath: string,
    currentDepth: number
  ): Promise<void> {
    if (currentDepth > maxDepth) {
      Logger.warn('Directory depth exceeds the maximum allowed depth.');
      return;
    }

    const items = fs.readdirSync(currentPath, { withFileTypes: true });

    await Promise.all(
      items.map(async (item) => {
        const itemPath = path.join(currentPath, item.name);

        if (ignoreSet.has(item.name)) {
          return; // Skip the item if it matches any of the ignore patterns
        }

        if (item.isDirectory()) {
          // Recursively process subdirectories
          await processDirectory(itemPath, currentDepth + 1);
        } else if (item.isFile()) {
          // Use streaming to read file and compute MD5 hash
          const fileHash = computeFileMetadataHash(itemPath);
          // Include the relative file path in the hash to ensure unique content
          const relativePath = path.relative(directoryPath, itemPath);
          fileHashes.set(relativePath, fileHash);
        }
      })
    );
  }

  // Start processing from the base directory with an initial depth of 0
  await processDirectory(directoryPath, 0);

  // Sort the file paths to ensure consistent ordering for the final hash
  const sortedFileHashes = Array.from(fileHashes)
    .sort(([pathA], [pathB]) => pathA.localeCompare(pathB))
    .map(([relativePath, fileHash]) => `${fileHash}:${relativePath}`);

  // Concatenate all file hashes and compute the final directory hash
  const md5 = crypto
    .createHash('md5')
    .update(sortedFileHashes.join('|'))
    .digest('hex');

  return {
    md5,
    fileHashes,
    directoryPath,
  };
}

/**
 * Computes a hash based on file metadata (size and modification time).
 * This is a faster alternative to reading the entire file content, but will not detect changes in file content, and not detect reverted changes (for example)
 */
function computeFileMetadataHash(filePath: string): string {
  const stats = fs.statSync(filePath);
  const metaHash = crypto.createHash('md5');
  metaHash.update(`${stats.size}:${stats.mtimeMs}`);
  return metaHash.digest('hex');
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
