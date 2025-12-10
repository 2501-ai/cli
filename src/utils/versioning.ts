import axios from 'axios';
import Logger from './logger';
import { version } from '../../package.json';

export async function isLatestVersion() {
  try {
    const { data } = await axios.get(
      'https://registry.npmjs.org/@2501-ai/cli/latest'
    );
    const latestVersion = data.version;
    const currentVersion = version;

    const isLatest = latestVersion === currentVersion;
    Logger.debug(
      `Version check: current=${currentVersion}, latest=${latestVersion}, isLatest=${isLatest}`
    );

    return isLatest;
  } catch (e) {
    Logger.debug('Failed to check for latest version:', e);
    throw new Error('Failed to check for latest version');
  }
}
