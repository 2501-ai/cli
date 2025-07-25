import Logger from '../utils/logger';
import {
  DEFAULT_PACKAGE_EXCLUSIONS,
  LINUX_PACKAGE_MANAGERS,
  MACOS_PACKAGE_MANAGERS,
  PackageManagerDefinition,
  WINDOWS_PACKAGE_MANAGERS,
} from '../utils/systemInfo';
import { SystemInfo } from '../utils/types';
import { isCommandNotFound } from './connectionParser';
import { RemoteExecutor } from './remoteExecutor';

async function getRemoteGlobalNpmPackages(
  platform: 'windows' | 'unix'
): Promise<string[]> {
  try {
    const command =
      platform === 'windows'
        ? 'npm list -g --depth=0 | findstr /R "^[├└]" | findstr "@"'
        : 'npm list -g --depth=0 | awk "{print $2}" | grep @';

    const executor = RemoteExecutor.instance;
    const output = await executor.executeCommand(command);
    const packageLines = output.trim().split('\n').filter(Boolean);

    if (platform === 'windows') {
      if (isCommandNotFound(output)) {
        return [];
      }

      // Extract package names from Windows output format
      // example output:
      // +-- corepack@0.32.0
      return packageLines
        .map(
          (line) =>
            line.replace(/^[+--\s]+/, '').split('@')[0] +
            '@' +
            line.split('@')[1]
        )
        .filter((pkg) => pkg.includes('@'))
        .map(sanitizeWindowsOutput);
    } else {
      // Unix/Linux output is already clean package names
      return packageLines.filter((pkg) => pkg.includes('@'));
    }
  } catch (error) {
    Logger.debug(
      'Error executing npm list command on remote:',
      (error as Error).message
    );
    if (error instanceof Error && isCommandNotFound(error.message)) {
      return [];
    }
    return [];
  }
}

/**
 * Command execution wrapper to handle errors and return a consistent format.
 */
async function getRemoteVersion(command: string): Promise<string> {
  try {
    const executor = RemoteExecutor.instance;
    const result = await executor.executeCommand(command);
    if (isCommandNotFound(result)) {
      return '(not found)';
    }
    return sanitizeWindowsOutput(result.trim());
  } catch (error) {
    Logger.debug(
      `Failed to get remote version for command "${command}":`,
      error
    );
    if (error instanceof Error && isCommandNotFound(error.message)) {
      return '(not found)';
    }

    return '(error)';
  }
}

async function getRemotePythonVersion(
  platform: 'windows' | 'unix'
): Promise<string> {
  // For Unix-like systems, python3 is preferred.
  if (platform === 'unix') {
    const py3Version = await getRemoteVersion('python3 --version');
    if (py3Version !== '(error)') {
      return py3Version;
    }
  }
  // Fallback to 'python' for Windows or if 'python3' fails on Unix.
  const output = await getRemoteVersion('python --version');
  return sanitizeWindowsOutput(output);
}

async function getRemoteOSInfo(platform: 'windows' | 'unix'): Promise<string> {
  const command = platform === 'windows' ? 'systeminfo' : 'uname -a';
  try {
    const executor = RemoteExecutor.instance;
    const result = await executor.executeCommand(command);
    return sanitizeWindowsOutput(result.trim());
  } catch (error) {
    Logger.debug(
      `Failed to get remote OS info for command "${command}":`,
      error
    );
    return `(${platform} - OS info unavailable)`;
  }
}

async function getUnixRemotePackages(): Promise<Record<string, string>> {
  const executor = RemoteExecutor.instance;
  let platformPms: readonly PackageManagerDefinition[] = [];

  // 1. Detect if Linux or macOS
  try {
    const uname = await executor.executeCommand('uname -s');
    if (uname.toLowerCase().includes('linux')) {
      platformPms = LINUX_PACKAGE_MANAGERS;
      Logger.debug('Detected remote OS: Linux');
    } else if (uname.toLowerCase().includes('darwin')) {
      platformPms = MACOS_PACKAGE_MANAGERS;
      Logger.debug('Detected remote OS: macOS');
    } else {
      Logger.debug(`Unsupported Unix variant: ${uname}`);
      return {};
    }
  } catch (e) {
    Logger.error('Could not determine remote Unix OS type.', e);
    return {};
  }

  // 2. Detect which package managers are installed
  const detectedPms = (
    await Promise.all(
      platformPms.map(async (pm) => {
        try {
          await executor.executeCommand(`command -v ${pm.cmd}`);
          return pm;
        } catch (e) {
          return null;
        }
      })
    )
  ).filter(Boolean) as PackageManagerDefinition[];

  if (!detectedPms.length) {
    Logger.debug('No package managers found on remote Unix host.');
    return {};
  }
  Logger.debug(
    'Detected remote package managers:',
    detectedPms.map((p) => p.cmd)
  );

  // 3. Get package lists
  const exclusionPattern = DEFAULT_PACKAGE_EXCLUSIONS.join('|');
  const allPackages = await Promise.all(
    detectedPms.map(async (pm) => {
      try {
        const listCmd = pm.listCmd(exclusionPattern);
        const stdout = await executor.executeCommand(listCmd);
        const packages = stdout.split('\n').filter(Boolean).sort();
        if (packages.length > 0) {
          return { [`packages installed via ${pm.cmd}`]: packages.join(',') };
        }
        return { [pm.cmd]: '' };
      } catch (error) {
        Logger.error(`Remote error executing ${pm.cmd} list command:`, error);
        return { [pm.cmd]: '' };
      }
    })
  );

  return allPackages.reduce((acc, curr) => ({ ...acc, ...curr }), {});
}

/**
 * Helper function to sanitize Windows command output.
 */
function sanitizeWindowsOutput(output: string): string {
  return output.trim().replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
}

async function getWindowsRemotePackages(): Promise<Record<string, string>> {
  const executor = RemoteExecutor.instance;
  const platformPms = WINDOWS_PACKAGE_MANAGERS;

  // 1. Detect which package managers are installed
  const detectedPms = (
    await Promise.all(
      platformPms.map(async (pm) => {
        try {
          // `where` is the equivalent of `command -v` on Windows
          const output = await executor.executeCommand(`where ${pm.cmd}`);
          if (isCommandNotFound(output)) {
            return null;
          }
          return pm;
        } catch (e) {
          return null;
        }
      })
    )
  ).filter(Boolean) as PackageManagerDefinition[];

  if (!detectedPms.length) {
    Logger.debug('No package managers found on remote Windows host.');
    return {};
  }
  Logger.debug(
    'Detected remote package managers:',
    detectedPms.map((p) => p.cmd)
  );

  // 2. Get package lists
  const exclusionPattern = DEFAULT_PACKAGE_EXCLUSIONS.join('|');
  const allPackages = await Promise.all(
    detectedPms.map(async (pm) => {
      try {
        const listCmd = pm.listCmd(exclusionPattern);
        const stdout = await executor.executeCommand(listCmd);
        const packages = sanitizeWindowsOutput(stdout)
          .split('\n')
          .filter(Boolean)
          .sort();
        if (packages.length > 0) {
          return { [`packages installed via ${pm.cmd}`]: packages.join(',') };
        }
        return { [pm.cmd]: '' };
      } catch (error) {
        Logger.debug(`Error executing remote ${pm.cmd} list command:`, error);
        return { [pm.cmd]: '' };
      }
    })
  );

  return allPackages.reduce((acc, curr) => ({ ...acc, ...curr }), {});
}

async function getRemoteInstalledPackages(
  platform: 'windows' | 'unix'
): Promise<Record<string, string>> {
  Logger.debug(`Getting remote packages for platform: ${platform}`);

  if (platform === 'windows') {
    return getWindowsRemotePackages();
  } else {
    return getUnixRemotePackages();
  }
}

export async function getRemoteSystemInfo(): Promise<SystemInfo> {
  const config = RemoteExecutor.instance.getConfig();
  const { target, platform } = config;

  Logger.debug(`Getting remote system info for host: ${target} (${platform})`);

  if (!RemoteExecutor.instance.isConnected) {
    await RemoteExecutor.instance.connect();
  }

  const [
    installed_packages,
    os_info,
    pythonVersion,
    phpVersion,
    globalNpmPackages,
  ] = await Promise.all([
    getRemoteInstalledPackages(platform),
    getRemoteOSInfo(platform),
    getRemotePythonVersion(platform),
    getRemoteVersion('php --version'),
    getRemoteGlobalNpmPackages(platform),
  ]);

  const sysInfo: SystemInfo['sysInfo'] = {
    platform: platform,
    os_info,
    installed_packages,
  };

  return {
    sysInfo,
    nodeInfo: {
      version: await getRemoteVersion('node --version'),
      global_packages: globalNpmPackages,
    },
    pythonInfo: {
      version: pythonVersion,
    },
    phpInfo: {
      version: phpVersion,
    },
  };
}
