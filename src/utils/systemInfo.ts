// Node.js built-in modules
import fs from 'fs';
import os from 'os';
import { promisify } from 'node:util';
import { exec, execSync, execFileSync } from 'child_process';

// Local utilities
import Logger from './logger';

// Local types
import { HostInfo, SystemInfo } from './types';

const execAsync = promisify(exec);

export type PackageManagerDefinition = {
  cmd: string;
  listCmd: (exclusionPattern: string) => string;
};

export type PackageManagerInfo = {
  cmd: string;
  listCmd: string;
};

// Package manager definitions per OS
export const LINUX_PACKAGE_MANAGERS: readonly PackageManagerDefinition[] = [
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
  /**
   * Here is the breakdown of the command:
   *
   * 1.  `yum history userinstalled 2>/dev/null`: This gets the initial list of packages installed by the user.
   * 2.  `sed '1d'`: This removes the header line.
   * 3.  `xargs -r -- rpm -q --qf '%{NAME}\\n'`:
   *    *   `xargs -r --`: Takes the list of packages from `sed` and passes them as arguments to the `rpm` command. The `-r` flag ensures `rpm` isn't run if there are no packages.
   *    *   `rpm -q --qf '%{NAME}\\n'`: This queries the `rpm` database for each package and uses the `--qf` (queryformat) option to print *only* the package `NAME`, followed by a newline.
   *    *   This is the most reliable way to get just the package name, stripped of all version, release, and architecture information.
   */
  {
    cmd: 'yum',
    listCmd: (exclusionPattern: string) =>
      `yum history userinstalled 2>/dev/null | sed '1d' | xargs -r -- rpm -q --qf '%{NAME}\\n' | grep -vE '${exclusionPattern}'`,
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

export const MACOS_PACKAGE_MANAGERS: readonly PackageManagerDefinition[] = [
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

export const WINDOWS_PACKAGE_MANAGERS: readonly PackageManagerDefinition[] = [
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
 * Get the list of global packages installed on the system for metrics.
 */
async function getGlobalNpmPackages() {
  try {
    // Execute the command and get the output as a string
    const platform = os.platform();
    const command =
      platform === 'win32'
        ? 'npm list -g --depth=0 | findstr /R "^[├└]" | findstr "@"'
        : 'npm list -g --depth=0 | awk "{print $2}" | grep @';
    const output = await execAsync(command, { encoding: 'utf8' });

    // Parse the output - it's not JSON, it's a list of package names
    const packageLines = output.stdout.trim().split('\n').filter(Boolean);

    if (platform === 'win32') {
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
  } catch {
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
  } catch {
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

  const platformMapping = {
    linux: LINUX_PACKAGE_MANAGERS,
    darwin: MACOS_PACKAGE_MANAGERS,
    win32: WINDOWS_PACKAGE_MANAGERS,
  };

  const packageDefs: readonly PackageManagerDefinition[] =
    platformMapping[platform as keyof typeof platformMapping] || [];

  return packageDefs.map((pm) => ({
    cmd: pm.cmd,
    listCmd: pm.listCmd(exclusionPattern),
  }));
}

// Default patterns to exclude
export const DEFAULT_PACKAGE_EXCLUSIONS = [
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

  const whichCommand = os.platform() === 'win32' ? 'where' : 'which';
  const pmChecks = await Promise.all(
    packageManagers.map(async (pm) => {
      try {
        await execAsync(`${whichCommand} ${pm.cmd}`);
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

/**
 * Safely check if a command exists in the system PATH
 * Only allows alphanumeric characters and common safe symbols
 */
function commandExists(command: string): boolean {
  // Only allow alphanumeric characters, dash and underscore
  if (!/^[a-zA-Z0-9\-_]+$/.test(command)) {
    Logger.error(`Invalid command name: ${command}`);
    return false;
  }

  try {
    // Use execFileSync which doesn't invoke a shell
    const whichCommand = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(whichCommand, [command], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates an IPv4 address
 */
function isValidIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;

  return parts.every((part) => {
    // Reject empty parts or parts with leading zeros (except "0" itself)
    if (!part || (part.length > 1 && part[0] === '0')) return false;

    const num = parseInt(part, 10);
    return !isNaN(num) && num >= 0 && num <= 255 && part === num.toString();
  });
}

async function getPublicIp(): Promise<string | null> {
  const service = 'https://checkip.amazonaws.com';

  try {
    if (commandExists('curl')) {
      const { stdout } = await execAsync('curl -s --max-time 3 ' + service);
      const result = stdout.trim();
      if (result && isValidIPv4(result)) return result;
    }

    if (commandExists('wget')) {
      const { stdout } = await execAsync('wget -qO- --timeout=3 ' + service);
      const result = stdout.trim();
      if (result && isValidIPv4(result)) return result;
    }
  } catch (error) {
    Logger.error('Failed to fetch public IP:', (error as Error).message);
  }

  return null;
}

export async function getHostInfo(): Promise<HostInfo> {
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
  } catch {
    const networkInterfaces = os.networkInterfaces();
    const mac =
      Object.values(networkInterfaces)
        .flat()
        .find((iface) => !iface?.internal && iface?.mac)?.mac || '';
    unique_id = `${os.hostname()}-${mac}`;
  }

  // Private IP
  const private_ip: string | null =
    Object.values(os.networkInterfaces())
      .flat()
      .find((iface) => !iface?.internal && iface?.family === 'IPv4')?.address ||
    null;

  // MAC address
  const mac: string | null =
    Object.values(os.networkInterfaces())
      .flat()
      .find((iface) => !iface?.internal && iface?.mac)?.mac || null;

  // Public IP
  const public_ip: string | null = await getPublicIp();
  const public_ip_note: string | null = public_ip
    ? null
    : 'Not available: no Internet access or external service unreachable.';

  return {
    unique_id,
    name: os.hostname(),
    private_ip,
    mac,
    public_ip,
    public_ip_note,
  };
}
