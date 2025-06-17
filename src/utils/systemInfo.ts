// Node.js built-in modules
import fs from 'fs';
import os from 'os';
import { promisify } from 'node:util';
import { exec, execSync } from 'child_process';

// Local utilities
import Logger from './logger';

// Local types
import { HostInfo, SystemInfo } from './types';

const execAsync = promisify(exec);

type PackageManagerInfo = {
  cmd: string;
  listCmd: string;
};

// Package manager definitions per OS
const LINUX_PACKAGE_MANAGERS = [
  {
    cmd: 'apt',
    listCmd: (exclusionPattern: string) =>
      `apt-mark showmanual 2>/dev/null | grep -vE '${exclusionPattern}'`,
  },
  {
    cmd: 'dnf',
    listCmd: (exclusionPattern: string) =>
      `dnf repoquery --userinstalled --queryformat "%{name}" 2>/dev/null | grep -vE '${exclusionPattern}'`,
  },
  {
    cmd: 'yum',
    listCmd: (exclusionPattern: string) =>
      `yum history list all 2>/dev/null | grep "U" | awk '{print $4}' | grep -vE '${exclusionPattern}'`,
  },
  {
    cmd: 'pacman',
    listCmd: (exclusionPattern: string) =>
      `pacman -Qe | grep -vE '${exclusionPattern}' | awk '{print $1}'`,
  },
  {
    cmd: 'zypper',
    listCmd: (exclusionPattern: string) =>
      `zypper search -i -t package | tail -n +5 | grep -vE '${exclusionPattern}' | awk '{print $3}'`,
  },
] as const;

const MACOS_PACKAGE_MANAGERS = [
  {
    cmd: 'brew',
    listCmd: (exclusionPattern: string) =>
      `brew leaves | grep -vE '${exclusionPattern}'`,
  },
  {
    cmd: 'port',
    listCmd: (exclusionPattern: string) =>
      `port echo requested | grep -vE '${exclusionPattern}' | awk '{print $1}'`,
  },
] as const;

const WINDOWS_PACKAGE_MANAGERS = [
  {
    cmd: 'winget',
    listCmd: (exclusionPattern: string) =>
      `winget list --accept-source-agreements | findstr /v "Name --- ${exclusionPattern}"`,
  },
  {
    cmd: 'choco',
    listCmd: (exclusionPattern: string) =>
      `choco list -lo | findstr /v "Chocolatey packages ${exclusionPattern}"`,
  },
  {
    cmd: 'scoop',
    listCmd: (exclusionPattern: string) =>
      `scoop list | findstr /v "Name --- ${exclusionPattern}"`,
  },
] as const;

/**
 * Get the list of global packages installed on the system for mnetrics.
 */
async function getGlobalNpmPackages() {
  try {
    // Execute the command and get the output as a string
    const command = "npm list -g --depth=0 | awk '{print $2}' | grep '@'";
    const output = await execAsync(command, { encoding: 'utf8' });

    // Split the output into lines and remove empty lines
    return output.stdout.split('\n').filter((line) => line.trim() !== '');
  } catch (error) {
    Logger.debug('Error executing command:', (error as Error).message);
    return [];
  }
}

/**
 * Get OS specific information. Fallback to os module if uname is not available.
 */
async function getOSInfo() {
  try {
    if (os.platform() === 'win32') {
      const { stdout } = await execAsync('systeminfo');
      return stdout.trim();
    } else {
      const { stdout } = await execAsync('uname -a');
      return stdout.trim();
    }
  } catch (error) {
    Logger.debug('Error getting OS info:', (error as Error).message);
    return (
      os.type() + ' ' + os.release() + ' ' + os.arch() + ' ' + os.platform()
    );
  }
}

/**
 * Get Python specific information.
 */
async function getPythonVersion() {
  try {
    const { stdout } = await execAsync('python --version');
    return stdout.trim();
  } catch (error) {
    // Logger.error('Error executing python --version:', (error as Error).message);
    return '(not installed)';
  }
}

/**
 * Get Python specific information.
 */
async function getPython3Version() {
  const { stdout } = await execAsync('python3 --version');
  return stdout.trim();
}

/**
 * Get PHP version
 */
async function getPhpVersion() {
  try {
    const { stdout } = await execAsync('php --version');
    return stdout.trim();
  } catch (error) {
    // Logger.error('Error executing php --version:', (error as Error).message);
    return '(not installed)';
  }
}

/**
 * Get basic system info for metrics, while respecting user privacy.
 */
export async function getSystemInfo(): Promise<SystemInfo> {
  const packageManagers = await detectPackageManagers();
  const installedPackages = await getInstalledPackages(packageManagers);
  const osInfo = await getOSInfo();
  const pythonVersion = await getPython3Version().catch(() =>
    getPythonVersion()
  );

  const phpVersion = await getPhpVersion();

  const sysInfo: SystemInfo['sysInfo'] = {
    platform: os.platform(),
    os_info: osInfo,
    installed_packages: installedPackages,
  };

  return {
    sysInfo,
    nodeInfo: {
      version: process.version,
      global_packages: await getGlobalNpmPackages(),
    },
    pythonInfo: {
      version: pythonVersion,
    },
    phpInfo: {
      version: phpVersion,
    },
  };
}

function getPackageManagersForPlatform(
  exclusionPattern = ''
): PackageManagerInfo[] {
  const platform = os.platform();

  switch (platform) {
    case 'linux':
      return LINUX_PACKAGE_MANAGERS.map((pm) => ({
        ...pm,
        listCmd: pm.listCmd(exclusionPattern),
      }));
    case 'darwin':
      return MACOS_PACKAGE_MANAGERS.map((pm) => ({
        ...pm,
        listCmd: pm.listCmd(exclusionPattern),
      }));
    case 'win32':
      return WINDOWS_PACKAGE_MANAGERS.map((pm) => ({
        ...pm,
        listCmd: pm.listCmd(exclusionPattern),
      }));
    default:
      return [];
  }
}

// Default patterns to exclude
const DEFAULT_PACKAGE_EXCLUSIONS = [
  '^lib', // Libraries
  '^python[0-9]?[@]?', // Python packages
  '^gcc-', // GCC compiler related
  '^perl-', // Perl modules
  '^php[0-9]?-', // PHP modules
  '^ruby-', // Ruby packages
  '^tex-', // TeX related
  '^fonts-', // Font packages
  '^xserver-', // X server packages
  '^kernel-', // Kernel packages
  '^linux-', // Linux packages
  '^openssh-', // SSH related
  '^mime-', // MIME type related
  '^bind[0-9]?-', // DNS related
  '^grub-', // Bootloader related
  '^systemd-', // System daemon related
  '^udev-', // Device manager related
  '^desktop-', // Desktop environment related
  '^glib[0-9]?-', // GLib related
  '^gtk[0-9]?-', // GTK related
];

async function detectPackageManagers(
  options: { additionalExclusions?: string[] } = {}
): Promise<PackageManagerInfo[]> {
  const exclusions = [
    ...DEFAULT_PACKAGE_EXCLUSIONS,
    ...(options.additionalExclusions || []),
  ];
  const exclusionPattern = exclusions.join('|');

  const packageManagers = getPackageManagersForPlatform(exclusionPattern);

  // Check all package managers in parallel

  const pmChecks = await Promise.all(
    packageManagers.map(async (pm) => {
      try {
        if (os.platform() === 'win32') {
          await execAsync(`where ${pm.cmd}`);
        } else {
          await execAsync(`which ${pm.cmd}`);
        }
        return pm;
      } catch (error) {
        Logger.debug(`Failed to find ${pm.cmd}`, {
          error: error,
          pm,
          platform: os.platform(),
        });
        return null;
      }
    })
  );

  return pmChecks.filter(Boolean) as PackageManagerInfo[];
}

/**
 * Get the list of apt packages installed on Linux system for metrics.
 */

async function getInstalledPackages(
  pms: PackageManagerInfo[]
): Promise<Record<string, string>> {
  if (!pms.length) {
    return {};
  }
  try {
    const allPackages = await Promise.all(
      pms.map(async (pm) => {
        try {
          const { stdout } = await execAsync(pm.listCmd);
          const packages = stdout
            .split('\n')
            .filter(Boolean) // Remove empty lines
            .sort(); // Sort alphabetically

          // Only create an entry if we have packages
          if (packages.length > 0) {
            return { [`packages installed via ${pm.cmd}`]: packages.join(',') };
          }

          Logger.debug(`No packages found for ${pm.cmd}`);
          return { [pm.cmd]: '' };
        } catch (error) {
          Logger.error(`Error executing ${pm.cmd}:`, (error as Error).message);
          return { [pm.cmd]: '' };
        }
      })
    );
    // Merge all package lists into a single object
    return allPackages.reduce(
      (acc, curr) => ({
        ...acc,
        ...curr,
      }),
      {}
    );
  } catch (error) {
    Logger.error('Error getting installed packages:', (error as Error).message);
    return {};
  }
}

export function getHostInfo(): HostInfo {
  let unique_id: string;
  try {
    if (process.platform === 'darwin') {
      unique_id = execSync(
        "ioreg -d2 -c IOPlatformExpertDevice | awk -F\\\" '/IOPlatformUUID/{print $(NF-1)}'"
      )
        .toString()
        .trim();
    } else if (process.platform === 'win32') {
      // For Windows, use the machine GUID from registry
      unique_id =
        execSync(
          'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid'
        )
          .toString()
          .trim()
          .split(/\s+/)
          .pop() || '';
    } else {
      // Check for Docker environment
      if (fs.existsSync('/.dockerenv')) {
        unique_id = process.env.HOSTNAME || os.hostname();
      } else {
        unique_id = execSync(
          'cat /var/lib/dbus/machine-id 2>/dev/null || cat /etc/machine-id'
        )
          .toString()
          .trim();
      }
    }
  } catch (error) {
    const networkInterfaces = os.networkInterfaces();
    const mac =
      Object.values(networkInterfaces)
        .flat()
        .find((iface) => !iface?.internal && iface?.mac)?.mac || '';
    unique_id = `${os.hostname()}-${mac}`;
  }

  return {
    unique_id,
    name: os.hostname(),
    private_ip: Object.values(os.networkInterfaces())
      .flat()
      .find((iface) => !iface?.internal && iface?.family === 'IPv4')?.address,
  };
}
