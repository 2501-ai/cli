import axios from 'axios';
import fs from 'fs';
import path from 'path';
import Logger from './logger';

export async function isLatestVersion() {
  try {
    const { data } = await axios.get(
      'https://registry.npmjs.org/@2501-ai/cli/latest'
    );
    const latestVersion = data.version;
    const currentVersion = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')).version;

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
