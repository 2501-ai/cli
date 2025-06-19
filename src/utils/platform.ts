import os from 'os';
import path from 'path';

/**
 * Get a temporary directory path for 2501 CLI
 * Creates a platform-specific path for storing temporary 2501 files
 * on windows: C:\Users\Username\AppData\Local\Temp\2501
 * on unix: /tmp/2501
 */
export function getTempPath2501(subPath?: string): string {
  const basePath = path.join(os.tmpdir(), '2501');
  return subPath ? path.join(basePath, subPath) : basePath;
}

/**
 * Get platform-specific logs directory for 2501
 */
export function getLogDir(): string {
  return getTempPath2501('logs');
}

/**
 * Check if the current platform is Windows
 */
export function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * Get platform-specific example workspace path for error messages
 */
export function getExampleWorkspacePath(): string {
  return isWindows() ? path.join(os.tmpdir(), 'workspace') : '/tmp/workspace';
}
