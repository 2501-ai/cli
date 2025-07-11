import Logger from '../utils/logger';
import {
  DEFAULT_PACKAGE_EXCLUSIONS,
  LINUX_PACKAGE_MANAGERS,
  MACOS_PACKAGE_MANAGERS,
  PackageManagerDefinition,
  WINDOWS_PACKAGE_MANAGERS,
} from '../utils/systemInfo';
import { SystemInfo } from '../utils/types';
import { RemoteExecutor } from './remoteExecutor';

async function getRemoteGlobalNpmPackages(
  remoteType: 'unix' | 'win'
): Promise<string[]> {
  try {
    const command =
      remoteType === 'win'
        ? 'npm list -g --depth=0 | findstr /R "^[├└]" | findstr "@"'
        : 'npm list -g --depth=0 | awk "{print $2}" | grep @';

    const executor = RemoteExecutor.instance;
    const output = await executor.executeCommand(command);
    const packageLines = output.trim().split('\n').filter(Boolean);

    if (remoteType === 'win') {
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
        .filter((pkg) => pkg.includes('@'));
    } else {
      // Unix/Linux output is already clean package names
      return packageLines.filter((pkg) => pkg.includes('@'));
    }
  } catch (error) {
    Logger.error(
      'Error executing npm list command on remote:',
      (error as Error).message
    );
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
    return result.trim();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes('command not found')
    ) {
      return '(not found)';
    }

    Logger.error(
      `Failed to get remote version for command "${command}":`,
      error
    );
    return '(error)';
  }
}

async function getRemotePythonVersion(
  remoteType: 'unix' | 'win'
): Promise<string> {
  // For Unix-like systems, python3 is preferred.
  if (remoteType === 'unix') {
    const py3Version = await getRemoteVersion('python3 --version');
    if (py3Version !== '(error)') {
      return py3Version;
    }
  }
  // Fallback to 'python' for Windows or if 'python3' fails on Unix.
  return getRemoteVersion('python --version');
}

async function getRemoteOSInfo(remoteType: 'unix' | 'win'): Promise<string> {
  const command = remoteType === 'win' ? 'systeminfo' : 'uname -a';
  try {
    const executor = RemoteExecutor.instance;
    const result = await executor.executeCommand(command);
    return result.trim();
  } catch (error) {
    Logger.error(
      `Failed to get remote OS info for command "${command}":`,
      error
    );
    return `(${remoteType} - OS info unavailable)`;
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

async function getWindowsRemotePackages(): Promise<Record<string, string>> {
  const executor = RemoteExecutor.instance;
  const platformPms = WINDOWS_PACKAGE_MANAGERS;

  // 1. Detect which package managers are installed
  const detectedPms = (
    await Promise.all(
      platformPms.map(async (pm) => {
        try {
          // `where` is the equivalent of `command -v` on Windows
          await executor.executeCommand(`where ${pm.cmd}`);
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

async function getRemoteInstalledPackages(
  remoteType: 'unix' | 'win'
): Promise<Record<string, string>> {
  Logger.debug(`Getting remote packages for type: ${remoteType}`);

  if (remoteType === 'win') {
    return getWindowsRemotePackages();
  } else {
    return getUnixRemotePackages();
  }
}

export async function getRemoteSystemInfo(): Promise<SystemInfo> {
  const { type, target } = RemoteExecutor.instance.getConfig();

  Logger.debug(`Getting remote system info for host: ${target}`);

  const [
    installed_packages,
    os_info,
    pythonVersion,
    phpVersion,
    globalNpmPackages,
  ] = await Promise.all([
    getRemoteInstalledPackages(type),
    getRemoteOSInfo(type),
    getRemotePythonVersion(type),
    getRemoteVersion('php --version'),
    getRemoteGlobalNpmPackages(type),
  ]);

  const sysInfo: SystemInfo['sysInfo'] = {
    platform: type,
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
