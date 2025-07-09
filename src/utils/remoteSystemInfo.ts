import { ConfigManager } from '../managers/configManager';
import { RemoteExecutor } from '../managers/remoteExecutor';
import { WinRMExecutor } from '../managers/winrmExecutor';
import Logger from './logger';
import {
  DEFAULT_PACKAGE_EXCLUSIONS,
  LINUX_PACKAGE_MANAGERS,
  MACOS_PACKAGE_MANAGERS,
  PackageManagerDefinition,
  WINDOWS_PACKAGE_MANAGERS,
} from './systemInfo';
import { SystemInfo } from './types';

async function getRemoteGlobalNpmPackages(
  executor: { executeCommand: (cmd: string) => Promise<string> },
  remoteType: 'unix' | 'win'
): Promise<string[]> {
  try {
    const command =
      remoteType === 'win'
        ? 'npm list -g --depth=0 | findstr /R "^[├└]" | findstr "@"'
        : 'npm list -g --depth=0 | awk "{print $2}" | grep @';

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
    Logger.debug(
      'Error executing npm list command on remote:',
      (error as Error).message
    );
    return [];
  }
}

async function getRemoteVersion(
  command: string,
  executor: { executeCommand: (cmd: string) => Promise<string> }
): Promise<string> {
  try {
    const result = await executor.executeCommand(command);
    return result.trim();
  } catch (error) {
    return '(not installed)';
  }
}

async function getRemotePythonVersion(
  executor: { executeCommand: (cmd: string) => Promise<string> },
  remoteType: 'unix' | 'win'
): Promise<string> {
  // For Unix-like systems, python3 is preferred.
  if (remoteType === 'unix') {
    const py3Version = await getRemoteVersion('python3 --version', executor);
    if (py3Version !== '(not installed)') {
      return py3Version;
    }
  }
  // Fallback to 'python' for Windows or if 'python3' fails on Unix.
  return getRemoteVersion('python --version', executor);
}

async function getRemoteOSInfo(
  executor: { executeCommand: (cmd: string) => Promise<string> },
  remoteType: 'unix' | 'win'
): Promise<string> {
  const command = remoteType === 'win' ? 'systeminfo' : 'uname -a';
  try {
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
  const remoteExecutor = RemoteExecutor.instance;
  let platformPms: readonly PackageManagerDefinition[] = [];

  // 1. Detect if Linux or macOS
  try {
    const uname = await remoteExecutor.executeCommand('uname -s');
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
          await remoteExecutor.executeCommand(`command -v ${pm.cmd}`);
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
        const stdout = await remoteExecutor.executeCommand(listCmd);
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
  const remoteExecutor = WinRMExecutor.instance;
  const platformPms = WINDOWS_PACKAGE_MANAGERS;

  // 1. Detect which package managers are installed
  const detectedPms = (
    await Promise.all(
      platformPms.map(async (pm) => {
        try {
          // `where` is the equivalent of `command -v` on Windows
          await remoteExecutor.executeCommand(`where ${pm.cmd}`);
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
        const stdout = await remoteExecutor.executeCommand(listCmd);
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

export async function getRemoteInstalledPackages(): Promise<
  Record<string, string>
> {
  const config = ConfigManager.instance;
  const remoteType = config.get('remote_exec_type');

  Logger.debug(`Getting remote packages for type: ${remoteType}`);

  if (remoteType === 'win') {
    return getWindowsRemotePackages();
  } else {
    return getUnixRemotePackages();
  }
}

export async function getRemoteSystemInfo(): Promise<SystemInfo> {
  const config = ConfigManager.instance;
  const remoteType = config.get('remote_exec_type');
  const executor =
    remoteType === 'win' ? WinRMExecutor.instance : RemoteExecutor.instance;

  Logger.debug(`Getting remote system info for type: ${remoteType}`);

  const [
    installed_packages,
    os_info,
    pythonVersion,
    phpVersion,
    globalNpmPackages,
  ] = await Promise.all([
    getRemoteInstalledPackages(),
    getRemoteOSInfo(executor, remoteType),
    getRemotePythonVersion(executor, remoteType),
    getRemoteVersion('php --version', executor),
    getRemoteGlobalNpmPackages(executor, remoteType),
  ]);

  const sysInfo: SystemInfo['sysInfo'] = {
    platform: remoteType,
    os_info,
    installed_packages,
  };

  return {
    sysInfo,
    nodeInfo: {
      version: await getRemoteVersion('node --version', executor),
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
