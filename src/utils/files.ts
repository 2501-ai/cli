import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Dirent } from 'node:fs';

import Logger from '../utils/logger';
import {
  DEFAULT_MAX_DEPTH,
  DEFAULT_MAX_DIR_SIZE,
  DEFAULT_MAX_FILE_SIZE,
  INCLUDED_FILE_EXTENSIONS,
} from '../constants';
import { IgnoreManager } from './ignore';
import { isText } from 'istextorbinary';

/**
 * Options for computing the MD5 hash of a directory and its contents.
 * @property {string} directoryPath - The path of the directory to hash
 * @property {number} [maxDepth=5] - The maximum depth to traverse for directory contents
 * @property {number} [maxDirSize=50MB] - The maximum directory size to hash
 */
interface DirectoryMd5HashOptions {
  directoryPath: string;
  maxDepth?: number;
  maxDirSize?: number;
}

export function isTextExtended(filePath: string): boolean | null {
  const extension = path.extname(filePath).toLowerCase();

  if (INCLUDED_FILE_EXTENSIONS.includes(extension)) {
    return true;
  }

  return isText(filePath);
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
  // ignoreSet: Set<string>;
  currentTotalSize: number;
  ignoreManager: IgnoreManager;
}): { totalSize: number; fileHashes: Map<string, string> } {
  // Limit the depth of directory traversal to avoid excessive resource usage
  if (params.currentDepth > params.maxDepth) {
    // Logger.error('Directory depth exceeds the maximum allowed depth.');
    return {
      totalSize: 0,
      fileHashes: new Map<string, string>(),
    };
  }

  // Check this first to avoid unnecessary processing.
  const gitignorePath = path.join(
    params.directoryPath,
    params.currentPath,
    '.gitignore'
  );
  if (fs.existsSync(gitignorePath)) {
    params.ignoreManager.loadGitignore(gitignorePath, params.currentPath);
  }

  const fileHashes = new Map<string, string>();

  let items: Dirent[] = [];
  try {
    items = fs.readdirSync(
      path.join(params.directoryPath, params.currentPath),
      { withFileTypes: true }
    );
  } catch (e) {
    Logger.error(`Error reading directory: ${(e as Error).message}`, e);
    return {
      totalSize: 0,
      fileHashes: new Map<string, string>(),
    };
  }

  let totalSize = 0;
  for (const item of items) {
    const itemRelativePath = path.join(params.currentPath, item.name);
    const itemFullPath = path.join(params.directoryPath, itemRelativePath);

    // Check if file/directory should be ignored
    if (params.ignoreManager.isIgnored(itemRelativePath)) {
      continue;
    }

    if (item.isDirectory()) {
      // Recursively process subdirectories
      const result = getDirectoryFiles({
        ...params,
        currentPath: itemRelativePath,
        currentDepth: params.currentDepth + 1,
        currentTotalSize: totalSize + params.currentTotalSize,
      });
      totalSize += result.totalSize;
      result.fileHashes.forEach((hash, relativePath) => {
        fileHashes.set(relativePath, hash);
      });
    } else if (item.isFile()) {
      // Use streaming to read file and compute MD5 hash
      const { hash: fileHash, size: fileSize } =
        computeFileMetadataHash(itemFullPath);

      // Put a limit to the file size
      if (fileSize > DEFAULT_MAX_FILE_SIZE) {
        continue;
      }

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

      // Include the relative file path in the hash to ensure unique content
      fileHashes.set(itemRelativePath, fileHash);
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
export function getDirectoryMd5Hash({
  directoryPath,
  maxDepth = DEFAULT_MAX_DEPTH,
  maxDirSize = DEFAULT_MAX_DIR_SIZE, // 50MB
}: DirectoryMd5HashOptions) {
  // Initialize ignore manager at root level
  const ignoreManager = IgnoreManager.getInstance();

  // Start processing from the base directory with an initial depth of 0
  const result = getDirectoryFiles({
    directoryPath,
    maxDepth,
    maxDirSize,
    currentPath: '',
    currentDepth: 0,
    currentTotalSize: 0,
    ignoreManager,
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
  // Logger.debug(`Hashing metadata for file: ${filePath}`);
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
