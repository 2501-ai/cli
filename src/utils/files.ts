import path from 'path';
import crypto from 'crypto';
import { performance } from 'node:perf_hooks';
import { IGNORED_FILE_PATTERNS } from './workspace';
import fs from 'fs';

interface DirectoryMd5HashOptions {
  directoryPath: string;
  maxDepth?: number; // Optional parameter to limit directory depth
  ignorePatterns?: string[]; // Optional array of patterns or names to ignore
}

interface WorkspaceState {
  md5: string; // md5 hash of the workspace state
  fileHashes: Map<string, string>; // Map of file paths to their respective hashes
}

interface WorkspaceDiff {
  added: string[]; // Files that are present in the new state but not in the old state
  removed: string[]; // Files that are present in the old state but not in the new state
  modified: string[]; // Files that are present in both states but have different hashes
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
}: DirectoryMd5HashOptions): Promise<WorkspaceState> {
  const fileHashes = new Map<string, string>();
  const ignoreSet = new Set(ignorePatterns);

  async function processDirectory(currentPath: string, currentDepth: number) {
    if (currentDepth > maxDepth) {
      // console.warn('Directory depth exceeds the maximum allowed depth.');
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

  /**
   * Computes the MD5 hash of a file asynchronously.
   * @deprecated This function is not used in the final implementation (too slow)
   */
  async function computeFileHash(filePath: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
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
  newState.fileHashes.forEach((newHash, filePath) => {
    if (!oldState.fileHashes.has(filePath)) {
      added.push(filePath);
    } else if (oldState.fileHashes.get(filePath) !== newHash) {
      modified.push(filePath);
    }
  });

  // Check for removed files
  oldState.fileHashes.forEach((_, filePath) => {
    if (!newState.fileHashes.has(filePath)) {
      removed.push(filePath);
    }
  });

  return { added, removed, modified };
}

/**
 * Wraps an asynchronous function to measure its execution time.
 * @param asyncFn - The asynchronous function to be wrapped.
 * @param fnName - Optional name of the function, used in logging.
 * @returns A new function that, when called, executes the original async function and logs its performance.
 */
function measurePerformance<T>(
  asyncFn: (...args: any[]) => Promise<T>,
  fnName: string = 'Async Function'
): (...args: Parameters<typeof asyncFn>) => Promise<T> {
  return async (...args: Parameters<typeof asyncFn>): Promise<T> => {
    const startTime = performance.now(); // Start the timer
    try {
      const result = await asyncFn(...args); // Execute the original function
      const endTime = performance.now(); // Stop the timer
      const duration = endTime - startTime; // Calculate the duration
      console.log(`${fnName} executed in: ${duration.toFixed(2)}ms`);
      return result; // Return the result of the original function
    } catch (error) {
      const endTime = performance.now(); // Stop the timer on error
      const duration = endTime - startTime; // Calculate the duration
      console.log(`${fnName} failed after: ${duration.toFixed(2)}ms`);
      throw error; // Rethrow the error after logging
    }
  };
}

// Example of using the performance wrapper:

// Assume getDirectoryMd5Hash is an async function that computes MD5 hash of a directory
// const wrappedGetDirectoryMd5Hash = measurePerformance(
//   getDirectoryMd5Hash,
//   'getDirectoryMd5Hash'
// );

// Example usage:
// const directoryPath =
//   '/Users/shide/Developments/clients/greenscope/greenserver'; // large codebase
// const directoryPath = '/tmp/2501-workspace';
// wrappedGetDirectoryMd5Hash({
//   directoryPath,
//   ignorePatterns: IGNORED_FILE_PATTERNS,
// })
//   .then(({ md5 }) => {
//     console.log(`MD5 hash of the directory: ${md5}`);
//   })
//   .catch((err) => console.error(err));
