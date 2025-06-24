import path from 'path';
import fs from 'fs';
import { getExampleWorkspacePath } from '../utils/platform';

const WINDOWS_UNSAFE_DIRS = [
  'C:\\',
  'C:\\Windows',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\ProgramData',
  'C:\\Users',
];

const MACOS_ALLOWED_SUBS = [
  '/private/tmp/', // Another temporary directory
  '/Library/Application Support/', // Application-specific data
  '/Library/Preferences/', // Application preferences
  '/usr/local/', // Local software installations
  '/Users/', // macOS user directories
  '/Volumes/', // Mounted volumes and external storage
];

const LINUX_ALLOWED_SUBS = [
  '/home/', // User home directories
  '/tmp/', // Temporary files
  '/var/tmp/', // Persistent temporary files
  '/var/cache/', // Cache files
  '/var/log/', // Log files
  '/var/lib/', // State information
  '/var/spool/', // Spooling data
  '/var/run/', // Runtime data
  '/var/mail/', // Mail storage
  '/usr', // User programs and binaries

  '/mnt/', // Mounted external storage
  '/media/', // Removable media
  '/opt/', // Optional software
  '/srv/', // Data serving
  '/data/', // Custom data directory (if used)
]; // Allow subdirectories under /mnt etc.

export const UNIX_UNSAFE_DIRS = [
  '/',
  '/bin',
  '/boot',
  '/dev',
  '/etc',
  '/lib',
  '/root',
  '/proc',
  '/run',
  '/snap',
  '/sys',
  '/tmp',
  '/var',
  '/System/',
  '/Applications/',
  '/Library/',
  '/Network/',
  '/System/',
  '/Volumes/',
  ...LINUX_ALLOWED_SUBS,
  ...MACOS_ALLOWED_SUBS,
];

const WINDOWS_EXCEPTIONS = ['C:\\Users\\']; // Allow subdirectories under C:\\Users
const UNIX_EXCEPTIONS = [...LINUX_ALLOWED_SUBS, ...MACOS_ALLOWED_SUBS]; // Allow subdirectories under /home and other exceptions.

/**
 * Throw an error if the workspace is a system directory.
 *
 * Small Security check to prevent using workspace on Unix and Windows root directory and other system directories:
 * - Windows root directory: 'C:\\'
 * - Windows System directories: 'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\ProgramData', 'C:\\Users'
 * - Unix system directories: '/', '/bin', '/etc', '/lib', '/usr'
 * - Unix user directories: '/home', '/root'
 * - Unix system configuration directories: '/etc', '/usr'
 * etc.
 */
export function isDirUnsafe(dir: string, throwOnly = false) {
  // Check if we're on Windows or Unix
  const isWindows = process.platform === 'win32';
  const unsafeDirectories = isWindows ? WINDOWS_UNSAFE_DIRS : UNIX_UNSAFE_DIRS;
  const exceptions = isWindows ? WINDOWS_EXCEPTIONS : UNIX_EXCEPTIONS;

  let realWorkspace;
  try {
    // A common way to circumvent security is by using symbolic links (symlinks)
    // to point to unsafe directories while appearing to be in safe directories
    realWorkspace = fs.realpathSync(dir); // Resolve symlinks
  } catch (err) {
    throw new Error('Failed to resolve the workspace directory.');
  }

  const normalizedWorkspace = path.resolve(realWorkspace);
  const unsafe = isUnsafe(normalizedWorkspace, unsafeDirectories, exceptions);
  if (throwOnly && unsafe) {
    throw new Error(
      `Cannot use system directory "${normalizedWorkspace}" as workspace, please choose another one (e.g. "${getExampleWorkspacePath()}")"`
    );
  }

  return unsafe;
}

/**
 * Check if the workspace is in an unsafe directory.
 *
 * - Will return true if the workspace is in an unsafe directory or an exception.
 * - Will return false if the workspace is a subdirectory of an exception.
 *
 * This allows subdirectories like '/home/user/workspace' but not '/home'.
 *
 * @TODO: improve the function to handle more edge cases.
 */
const isUnsafe = (
  normalizedWorkspace: string,
  unsafeDirs: string[],
  exceptions: string[] = []
) => {
  // Check that we're not in the home user directory
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (homeDir) {
    if (normalizedWorkspace === path.resolve(homeDir)) {
      return true;
    }
  }

  const resolvedUnsafeDirs = unsafeDirs.map(
    (dir) => path.resolve(dir) + path.sep
  );
  const resolvedExceptions = exceptions.map(
    (exc) => path.resolve(exc) + path.sep
  );

  // Check if the workspace is directly in an unsafe directory
  const isInUnsafeDir = resolvedUnsafeDirs.some(
    (dir) =>
      normalizedWorkspace.startsWith(dir) ||
      normalizedWorkspace === dir.slice(0, -1)
  );

  // Check if the workspace is a subdirectory.
  const isInExceptionDir = resolvedExceptions.some(
    (exc) =>
      normalizedWorkspace.startsWith(exc) &&
      normalizedWorkspace !== exc.slice(0, -1)
  );

  return isInUnsafeDir && !isInExceptionDir;
};
