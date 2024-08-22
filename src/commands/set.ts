import { Config, readConfig, setValue } from '../utils/conf';
import { Logger } from '../utils/logger';

export function setCommand() {
  const config = readConfig();
  if (!config) return;

  const key = process.argv[3];
  const value = process.argv[4];

  if (!key) {
    Logger.error('Please provide a key to set.');
    return;
  }

  if (!value) {
    Logger.error('Please provide a value to set.');
    return;
  }

  setValue(key as keyof Config, value);
  Logger.success(`${key} set successfully.`);
}
