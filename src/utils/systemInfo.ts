import { execSync } from 'child_process';
import { SystemInfo } from './types';
import os from 'os';
import Logger from './logger';

/**
 * Get the list of global packages installed on the system for mnetrics.
 */
function getGlobalPackages() {
  try {
    // Execute the command and get the output as a string
    const command = "npm list -g --depth=0 | awk '{print $2}' | grep '@'";
    const output = execSync(command, { encoding: 'utf-8' });

    // Split the output into lines and remove empty lines
    return output.split('\n').filter((line) => line.trim() !== '');
  } catch (error) {
    Logger.error('Error executing command:', (error as Error).message);
    return [];
  }
}

/**
 * Get basic system info for metrics, while respecting user privacy.
 */
export function getSystemInfo(): SystemInfo {
  const { speed, model } = os.cpus()[0];
  const sysInfo = {
    cpu: {
      speed,
      model,
      cores: os.cpus().length,
    },
    mem: os.totalmem() / 1024 / 1024,
    platform: os.platform(),
    type: os.type(),
    release: os.release(),
    arch: os.arch(),
    // hostname: os.hostname(), // Not sure if we should collect this
  };

  return {
    sysInfo,
    nodeInfo: {
      version: process.version,
      config: process.config,
      packages: getGlobalPackages(),
    },
  };
}
