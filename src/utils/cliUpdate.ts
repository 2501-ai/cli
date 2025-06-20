import { run_shell } from '../helpers/actions';
import { isLatestVersion } from './versioning';
import Logger from './logger';
import { ConfigManager } from '../managers/configManager';

export async function autoUpdate() {
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

    if (updateCommand.includes('ERROR')) {
      Logger.error('Failed to auto-update 2501 CLI', updateCommand);
      return false;
    }

    Logger.debug('CLI successfully updated to latest version');
    return true;
  } catch (error) {
    Logger.error('Failed to auto-update 2501 CLI:', error);
    return false;
  }
}

export async function isAutoUpdate(): Promise<boolean> {
  const config = ConfigManager.instance;

  // Prevent infinite loop
  if (process.env.TFZO_UPDATED === 'true') {
    return false;
  }

  if (!config.get('auto_update')) {
    try {
      const isLatest = await isLatestVersion();
      if (!isLatest) {
        Logger.log(
          'UPDATE AVAILABLE: A new version of 2501 CLI is available. Run `npm i -g @2501-ai/cli` to update or enable auto-update with `@2501 set auto-update true`'
        );
      }
    } catch (error) {
      Logger.debug('Failed to check version:', error);
    }
    return false;
  }

  const wasUpdated = await autoUpdate();

  if (wasUpdated) {
    Logger.log('Auto-update completed. Restarting task with new process.');

    // Get the original command arguments
    const args = process.argv.slice(2);
    const command = `TFZO_UPDATED=true @2501 ${args.join(' ')}`;

    // Execute the new process
    const result = await run_shell({
      command,
      shell: true,
      env: {
        ...process.env,
        TFZO_UPDATED: 'true',
      },
    });

    // Print the result and exit
    if (result) {
      console.log(result);
    }

    process.exit(0);
  }

  return false;
}
