import { exec } from 'child_process';
import os from 'os';
import { promisify } from 'node:util';

// Local imports
import { SystemInfo } from './types';
import Logger from './logger';

const execAsync = promisify(exec);

/**
 * Get the list of global packages installed on the system for mnetrics.
 */
async function getGlobalPackages() {
  try {
    // Execute the command and get the output as a string
    const command = "npm list -g --depth=0 | awk '{print $2}' | grep '@'";
    const output = await execAsync(command, { encoding: 'utf8' });

    // Split the output into lines and remove empty lines
    return output.stdout.split('\n').filter((line) => line.trim() !== '');
  } catch (error) {
    Logger.error('Error executing command:', (error as Error).message);
    return [];
  }
}

/**
 * Get basic system info for metrics, while respecting user privacy.
 */
export async function getSystemInfo(): Promise<SystemInfo> {
  const pm = await getPackageManager();
  const installedPackages = await getInstalledPackages(pm);
  const sysInfo = {
    platform: os.platform(),
    type: os.type(),
    release: os.release(),
    arch: os.arch(),
    package_manager: pm?.cmd ?? 'unknown',
    installed_packages: installedPackages,
  };

  return {
    sysInfo,
    nodeInfo: {
      version: process.version,
      config: process.config,
      packages: await getGlobalPackages(),
    },
  };
}

async function getPackageManager(
  options: { additionalExclusions?: string[] } = {}
) {
  // Default patterns to exclude
  const defaultExclusions = [
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

  // Combine default exclusions with any user-provided ones
  const exclusions = [
    ...defaultExclusions,
    ...(options.additionalExclusions || []),
  ];
  const exclusionPattern = exclusions.join('|');

  const packageManagers = [
    {
      cmd: 'apt',
      // apt-mark showmanual shows only manually installed packages
      listCmd: `apt-mark showmanual 2>/dev/null | grep -vE '${exclusionPattern}'`,
    },
    {
      cmd: 'dnf',
      // @System.Original shows only user-installed packages
      listCmd: `dnf repoquery --userinstalled --queryformat "%{name}" 2>/dev/null | grep -vE '${exclusionPattern}'`,
    },
    {
      cmd: 'yum',
      // Similar to dnf
      listCmd: `yum history list all 2>/dev/null | grep "U" | awk '{print $4}' | grep -vE '${exclusionPattern}'`,
    },
    {
      cmd: 'pacman',
      // -Qe shows explicitly installed packages
      listCmd: `pacman -Qe | grep -vE '${exclusionPattern}' | awk '{print $1}'`,
    },
    {
      cmd: 'zypper',
      // +i shows installed packages, -t pattern excludes patterns
      listCmd: `zypper search -i -t package | tail -n +5 | grep -vE '${exclusionPattern}' | awk '{print $3}'`,
    },
    {
      cmd: 'brew',
      // leaves shows only manually installed formulae
      listCmd: `brew leaves | grep -vE '${exclusionPattern}'`,
    },
    {
      cmd: 'port',
      // requested shows only explicitly installed ports
      listCmd: `port echo requested | grep -vE '${exclusionPattern}' | awk '{print $1}'`,
    },
  ];

  async function executePackageList(command: string) {
    try {
      return (await execAsync(command)).stdout
        .split('\n')
        .filter(Boolean) // Remove empty lines
        .sort(); // Sort alphabetically
    } catch (error) {
      throw new Error(
        `Failed to execute package list command: ${(error as Error).message}`
      );
    }
  }

  for (const pm of packageManagers) {
    try {
      // First check if the package manager exists
      await execAsync(`which ${pm.cmd}`);

      // Return object with both the package manager info and a function to list packages
      return {
        ...pm,
        listPackages: () => executePackageList(pm.listCmd),
      };
    } catch {}
  }
  return null;
}

/**
 * Get the list of apt packages installed on Linux system for metrics.
 */
async function getInstalledPackages(
  pm: { cmd: string; listPackages: () => Promise<string[]> } | null
): Promise<string[]> {
  let packages: string[] = [];

  if (!pm) {
    return [];
  }

  try {
    packages = await pm.listPackages();
  } catch (error) {
    Logger.error('Error:', (error as Error).message);
  }
  return packages;
}
