import axios from 'axios';

export async function isLatestVersion() {
  try {
    const { data } = await axios.get(
      'https://registry.npmjs.org/@2501-ai/cli/latest'
    );
    const latestVersion = data.version;
    const currentVersion = require('../../package.json').version;

    return latestVersion === currentVersion;
  } catch (e) {
    throw new Error('Failed to check for latest version');
  }
}
