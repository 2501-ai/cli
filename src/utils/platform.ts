import os from 'os';
import path from 'path';

/**
 * Get the platform-specific temporary directory
 * - Windows: Uses TEMP or TMP environment variable (e.g., C:\Users\Username\AppData\Local\Temp)
 * - Unix (Linux/Mac): Uses /tmp
 */
export function getTempDir(): string {
  return os.tmpdir();
}

/**
 * Get a temporary directory path for 2501 CLI
 * Creates a platform-specific path for storing temporary 2501 files
 */
export function getTempPath2501(subPath?: string): string {
  const basePath = path.join(getTempDir(), '2501');
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
  return isWindows() ? 'C:\\workspace' : '/tmp/workspace';
}
