import { ConfigManager } from '../managers/configManager';
import Logger from '../utils/logger';
import { LocalConfigKey } from '../utils/types';

// Keys that need to be parsed as JSON (boolean)
const KEYS_WITH_PARSING: LocalConfigKey[] = [
  'stream',
  'disable_spinner',
  'auto_update',
];
const logger = new Logger();

export async function setCommand(key: string, value?: string) {
  const configKey = key as LocalConfigKey;

  if (!configKey) {
    logger.cancel('Please provide a key to set.');
    return;
  }

  if (!value) {
    logger.cancel('Please provide a value to set.');
    return;
  }

  try {
    // Parse boolean values
    let parsedValue: any = value;
    if (KEYS_WITH_PARSING.includes(configKey)) {
      parsedValue = JSON.parse(value);
    }

    ConfigManager.instance.set(configKey, parsedValue);
    logger.log(`${configKey} set successfully to ${parsedValue}.`);
  } catch (error) {
    logger.stop('Failed to set configuration', 1);
    throw error;
  }
}
