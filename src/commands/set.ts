import { ConfigManager } from '../managers/configManager';
import Logger from '../utils/logger';
import { LocalConfigKey } from '../utils/types';

// Keys that need to be parsed as JSON (boolean)
const KEYS_WITH_PARSING: LocalConfigKey[] = ['stream', 'disable_spinner'];
const logger = new Logger();

export function setCommand() {
  const key = process.argv[3] as LocalConfigKey;
  let value = process.argv[4];

  if (!key) {
    logger.cancel('Please provide a key to set.');
    return;
  }

  if (!value) {
    logger.cancel('Please provide a value to set.');
    return;
  }

  try {
    // Parse boolean values
    if (KEYS_WITH_PARSING.includes(key)) {
      value = JSON.parse(value);
    }

    ConfigManager.instance.set(key, value);
    logger.log(`${key} set successfully to ${value}.`);
  } catch (error) {
    logger.cancel((error as Error).message);
  }
}
