import { run_shell, hasError } from '../helpers/actions';
import { isLatestVersion } from './versioning';
import Logger from './logger';
import { ConfigManager } from '../managers/configManager';

const autoUpdate = async () => {
  try {
    const isLatest = await isLatestVersion();
    Logger.debug('Hit auto update');

    // Do not need update.
    if (isLatest) {
      return false;
    }

    Logger.debug('Auto update of the CLI start');

    Logger.log('Auto-updating the CLI, please wait ...');
    const updateCommand = await run_shell({
      command: 'npm i -g @2501-ai/cli',
      shell: true,
    });

    // Check if the command failed using the hasError helper
    if (hasError(updateCommand)) {
      Logger.warn('Failed to auto-update 2501 CLI', updateCommand);
      return false;
    }

    Logger.debug('CLI successfully updated to latest version');
    return true;
  } catch (error) {
    Logger.warn('Failed to auto-update 2501 CLI:', error);
    return false;
  }
};

/**
 * Properly escape shell arguments to preserve spaces and special characters
 */
function escapeShellArg(arg: string): string {
  // If the argument contains spaces, quotes, or other special characters, wrap it in quotes
  if (
    arg.includes(' ') ||
    arg.includes('"') ||
    arg.includes("'") ||
    arg.includes('\\') ||
    arg.includes('$') ||
    arg.includes('`')
  ) {
    // Escape any existing double quotes and wrap in double quotes
    return `"${arg.replace(/"/g, '\\"')}"`;
  }
  return arg;
}

export async function handleAutoUpdate(): Promise<boolean> {
  const config = ConfigManager.instance;

  // Prevent infinite loop
  if (process.env.TFZO_UPDATED === 'true') {
    return false;
  }

  if (!config.get('auto_update')) {
    const isLatest = await isLatestVersion();
    if (!isLatest) {
      Logger.log(
        'UPDATE AVAILABLE: A new version of 2501 CLI is available. Run `npm i -g @2501-ai/cli` to update or enable auto-update with `@2501 set auto_update true`'
      );
    }
    return false;
  }

  const wasUpdated = await autoUpdate();

  if (!wasUpdated) {
    return false;
  }

  Logger.log('Auto-update completed. Restarting task with new process.');

  // Properly escape arguments to preserve original quoting and spacing
  const escapedArgs = process.argv.map(escapeShellArg);
  const originalCommand = escapedArgs.join(' ');

  // Execute the new process with TFZO_UPDATED in env
  const result = await run_shell({
    command: originalCommand,
    shell: true,
    env: {
      ...process.env,
      TFZO_UPDATED: 'true',
    },
  });

  // Print the result and exit
  if (result) {
    Logger.log(result);
  }

  process.exit(0);
}
