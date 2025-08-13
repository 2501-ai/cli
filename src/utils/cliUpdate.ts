import { run_shell, hasError } from '../helpers/actions';
import { isLatestVersion } from './versioning';
import Logger from './logger';
import { ConfigManager } from '../managers/configManager';
import execa from 'execa';

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

  // Use execa directly with the original arguments array to avoid shell parsing issues
  const [nodePath, scriptPath, ...args] = process.argv;

  try {
    await execa(nodePath, [scriptPath, ...args], {
      stdio: 'inherit',
      env: {
        ...process.env,
        TFZO_UPDATED: 'true',
      },
    });
  } catch (error) {
    Logger.error('Failed to restart process:', error);
    process.exit(1);
  }

  process.exit(0);
}
