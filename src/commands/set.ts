import { readConfig, setValue } from '../utils/conf';
import Logger from '../utils/logger';
import { Config } from '../utils/types';

export function setCommand() {
  const config = readConfig();
  if (!config) return;

  const key = process.argv[3];
  let value = process.argv[4];

  if (!key) {
    Logger.error('Please provide a key to set.');
    return;
  }

  if (!value) {
    Logger.error('Please provide a value to set.');
    return;
  }

  if (key === 'stream') {
    value = JSON.parse(value);
  }

  setValue(key as keyof Config, value);
  Logger.log(`${key} set successfully.`);
}
