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
    Logger.log('Updating 2501 CLI to latest version');

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

export async function isAutoUpdate() {
  const config = ConfigManager.instance;

  if (!config.get('auto_update')) {
    try {
      const isLatest = await isLatestVersion();
      // Do not need update.
      if (!isLatest) {
        Logger.log(
          'UPDATE AVAILABLE: A new version of 2501 CLI is available. Run `npm i -g @2501-ai/cli` to update or enable auto-update with `@2501 set auto-update true`'
        );
      }
    } catch (error) {}
    return;
  }
  await autoUpdate();
}
