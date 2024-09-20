import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import Logger from '../utils/logger';
import {
  DEFAULT_MAX_DEPTH,
  DEFAULT_MAX_DIR_SIZE,
  IGNORED_FILE_PATTERNS,
} from '../constants';
import { Dirent } from 'node:fs';

/**
 * Options for computing the MD5 hash of a directory and its contents.
 * @property {string} directoryPath - The path of the directory to hash
 * @property {number} [maxDepth=10] - The maximum depth to traverse for directory contents
 */
interface DirectoryMd5HashOptions {
  directoryPath: string;
  maxDepth?: number; // Optional parameter to limit directory depth
  maxDirSize?: number; // Optional parameter to limit directory size (in bytes)
}

/**
 * Converts a byte size to a human-readable format.
 */
export const toReadableSize = (bytes: number) => {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Bytes';

  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = (bytes / Math.pow(1024, i)).toFixed(2);

  // Correct singular/plural based on the size
  return `${size} ${sizes[i]}`;
};

/**
 * Get the list of files to ignore in the workspace, enriched with patterns from .gitignore if present.
 */
export function getIgnoredFiles(workspace: string): Set<string> {
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

  return ignorePatterns;
}

/**
 * Check if the total size of the directory has reached the threshold.
 */
function hasReachedThreshold(totalSize: number, maxSize: number) {
  return totalSize / maxSize >= 0.999; // 0.1% margin
}

export function getDirectoryFiles(params: {
  directoryPath: string;
  maxDepth: number;
  maxDirSize: number;
  currentPath: string;
  currentDepth: number;
  ignoreSet: Set<string>;
  currentTotalSize: number;
}): { totalSize: number; fileHashes: Map<string, string> } {
  // Limit the depth of directory traversal to avoid excessive resource usage
  if (params.currentDepth > params.maxDepth) {
    // Logger.error('Directory depth exceeds the maximum allowed depth.');
    return {
      totalSize: 0,
      fileHashes: new Map<string, string>(),
    };
  }

  const fileHashes = new Map<string, string>();

  let items: Dirent[] = [];
  try {
    items = fs.readdirSync(
      path.join(params.directoryPath, params.currentPath),
      { withFileTypes: true }
    );
  } catch (e) {
    Logger.error(`Error reading directory: ${(e as Error).message}`);
    return {
      totalSize: 0,
      fileHashes: new Map<string, string>(),
    };
  }

  let totalSize = 0;
  for (const item of items) {
    const itemPath = path.join(params.currentPath, item.name);

    if (params.ignoreSet.has(item.name)) {
      continue; // Skip the item if it matches any of the ignore patterns
    }

    if (item.isDirectory()) {
      // Recursively process subdirectories
      const result = getDirectoryFiles({
        currentPath: itemPath,
        currentDepth: params.currentDepth + 1,
        ignoreSet: params.ignoreSet,
        maxDepth: params.maxDepth,
        maxDirSize: params.maxDirSize,
        directoryPath: params.directoryPath,
        currentTotalSize: totalSize + params.currentTotalSize,
      });
      totalSize += result.totalSize;
      result.fileHashes.forEach((hash, relativePath) => {
        fileHashes.set(relativePath, hash);
      });
    } else if (item.isFile()) {
      // Use streaming to read file and compute MD5 hash
      const { hash: fileHash, size: fileSize } =
        computeFileMetadataHash(itemPath);

      const sizeWithFile = totalSize + params.currentTotalSize + fileSize;
      if (sizeWithFile >= params.maxDirSize) {
        // If we have enough files without the current file, we can stop processing.
        if (
          hasReachedThreshold(
            totalSize + params.currentTotalSize,
            params.maxDirSize
          )
        ) {
          break;
        }
        // We continue processing other files in the directory,
        // in case the current file size is exceedingly large but other files might be lighter.
        continue;
      }
      // params.currentTotalSize += fileSize;
      // Include the relative file path in the hash to ensure unique content
      const relativePath = path.relative(params.directoryPath, itemPath);
      fileHashes.set(relativePath, fileHash);
      totalSize += fileSize;
    }
  }

  return {
    totalSize,
    fileHashes,
  };
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
  maxDepth = DEFAULT_MAX_DEPTH,
  maxDirSize = DEFAULT_MAX_DIR_SIZE, // 10MB
}: DirectoryMd5HashOptions) {
  const ignoreSet = getIgnoredFiles(directoryPath);
  // Start processing from the base directory with an initial depth of 0
  const result = getDirectoryFiles({
    directoryPath,
    maxDepth,
    maxDirSize,
    currentPath: '',
    currentDepth: 0,
    ignoreSet,
    currentTotalSize: 0,
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
