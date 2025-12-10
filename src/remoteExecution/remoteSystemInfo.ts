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
import { isCommandNotFound, sanitizeWindowsOutput } from './windowsHelper';

async function getRemoteGlobalNpmPackages(
  platform: 'windows' | 'unix' | 'fortigate'
): Promise<string[]> {
  if (platform === 'fortigate') {
    return [];
  }
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
  platform: 'windows' | 'unix' | 'fortigate'
): Promise<string> {
  if (platform === 'fortigate') {
    return '(not applicable)';
  }

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

/**
 * Parses FortiOS system information from 'get system status' command output.
 */
function parseFortigateSystemInfo(output: string): string {
  try {
    const lines = output.split('\n').map((line) => line.trim());
    let version = '';
    let model = '';
    let serialNumber = '';
    let hostname = '';
    let licenseStatus = '';
    let operationMode = '';
    let haMode = '';
    let resources = '';

    for (const line of lines) {
      // Extract FortiOS version and model from Version line
      if (line.includes('Version:')) {
        const versionMatch = line.match(/Version:\s*([^,]+)/);
        if (versionMatch) {
          const fullVersion = versionMatch[1].trim();
          // Extract model (e.g., FortiGate-VM64)
          const modelMatch = fullVersion.match(/(FortiGate[^\s]*)/i);
          if (modelMatch) {
            model = modelMatch[1];
          }
          // Extract version (e.g., v7.4.8)
          const versionNumMatch = fullVersion.match(/v?(\d+\.\d+\.\d+)/);
          if (versionNumMatch) {
            version = `v${versionNumMatch[1]}`;
          }
          // Extract build number
          const buildMatch = line.match(/build(\d+)/i);
          if (buildMatch) {
            version += ` (build ${buildMatch[1]})`;
          }
        }
      }

      // Extract other valuable information
      if (line.includes('Serial-Number:')) {
        serialNumber = line.split(':')[1]?.trim() || '';
      }
      if (line.includes('Hostname:')) {
        hostname = line.split(':')[1]?.trim() || '';
      }
      if (line.includes('License Status:')) {
        licenseStatus = line.split(':')[1]?.trim() || '';
      }
      if (line.includes('Operation Mode:')) {
        operationMode = line.split(':')[1]?.trim() || '';
      }
      if (line.includes('Current HA mode:')) {
        haMode = line.split(':')[1]?.trim() || '';
      }
      if (line.includes('VM Resources:')) {
        resources = line.split(':')[1]?.trim() || '';
      }
    }

    // Construct comprehensive system info
    const parts = [];

    if (model && version) {
      parts.push(`${model} FortiOS ${version}`);
    } else if (version) {
      parts.push(`FortiGate FortiOS ${version}`);
    } else {
      parts.push('FortiGate FortiOS');
    }

    if (hostname) {
      parts.push(`Hostname: ${hostname}`);
    }
    if (serialNumber) {
      parts.push(`S/N: ${serialNumber}`);
    }
    if (operationMode) {
      parts.push(`Mode: ${operationMode}`);
    }
    if (haMode && haMode !== 'standalone') {
      parts.push(`HA: ${haMode}`);
    }
    if (licenseStatus) {
      parts.push(`License: ${licenseStatus}`);
    }
    if (resources) {
      parts.push(`Resources: ${resources}`);
    }

    return parts.join(' | ');
  } catch (error) {
    Logger.debug('Error parsing FortiGate system info:', error);
    return 'FortiGate FortiOS';
  }
}

async function getRemoteOSInfo(
  platform: 'windows' | 'unix' | 'fortigate'
): Promise<string> {
  const executor = RemoteExecutor.instance;
  // Windows OS Info
  if (platform === 'windows') {
    try {
      const result = await executor.executeCommand('systeminfo');
      return sanitizeWindowsOutput(result.trim());
    } catch (error) {
      Logger.debug('Failed to get remote Windows OS info:', error);
      return '(windows - OS info unavailable)';
    }
  }

  // Retrieve Fortigate OS Info
  if (platform === 'fortigate') {
    Logger.debug(
      'Attempting FortiGate detection with "get system status" command'
    );
    const fortigateResult = await executor.executeCommand(
      'get system status',
      undefined,
      true
    );

    return parseFortigateSystemInfo(fortigateResult);
  }

  // Standard Linux detection fallback
  try {
    Logger.debug('Attempting standard Linux detection with "uname -a" command');
    const result = await executor.executeCommand('uname -a');
    return sanitizeWindowsOutput(result.trim());
  } catch (error) {
    Logger.debug('Failed to get remote Unix OS info:', error);
    return '(unix - OS info unavailable)';
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
        } catch {
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

async function getFortigateRemotePackages(): Promise<Record<string, string>> {
  const executor = RemoteExecutor.instance;
  const result = await executor.executeCommand(
    'get system global',
    undefined,
    true
  );
  return { FortiGate: result };
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
        } catch {
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
  platform: 'windows' | 'unix' | 'fortigate'
): Promise<Record<string, string>> {
  Logger.debug(`Getting remote packages for platform: ${platform}`);

  if (platform === 'windows') {
    return getWindowsRemotePackages();
  } else if (platform === 'fortigate') {
    return getFortigateRemotePackages();
  } else {
    return getUnixRemotePackages();
  }
}

async function getPhpInfo(
  platform: 'windows' | 'unix' | 'fortigate'
): Promise<string> {
  if (platform === 'fortigate') {
    return '(not applicable)';
  }
  return getRemoteVersion('php --version');
}

async function getNodeInfo(
  platform: 'windows' | 'unix' | 'fortigate'
): Promise<string> {
  if (platform === 'fortigate') {
    return '(not applicable)';
  }
  return getRemoteVersion('node --version');
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
    nodeVersion,
  ] = await Promise.all([
    getRemoteInstalledPackages(platform),
    getRemoteOSInfo(platform),
    getRemotePythonVersion(platform),
    getPhpInfo(platform),
    getRemoteGlobalNpmPackages(platform),
    getNodeInfo(platform),
  ]);

  const sysInfo: SystemInfo['sysInfo'] = {
    platform: platform,
    os_info,
    installed_packages,
  };

  return {
    sysInfo,
    nodeInfo: {
      version: nodeVersion,
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
