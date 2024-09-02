import crypto from 'crypto';
import fs from 'fs';

import Logger from '../utils/logger';
import { getIgnoredFiles, getWorkspaceFiles } from '../helpers/workspace';

/**
 * Options for computing the MD5 hash of a directory and its contents.
 * @property {string} directoryPath - The path of the directory to hash
 * @property {number} [maxDepth=10] - The maximum depth to traverse for directory contents
 * @property {string[]} [ignorePatterns] - An array of patterns or names to ignore
 */
interface DirectoryMd5HashOptions {
  directoryPath: string;
  maxDepth?: number; // Optional parameter to limit directory depth
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
  const ignoreSet = getIgnoredFiles(directoryPath);
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
