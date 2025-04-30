import { readConfig, setValue } from '../utils/conf';
import Logger from '../utils/logger';
import { LocalConfigKey } from '../utils/types';

const KEYS_WITH_PARSING: LocalConfigKey[] = ['stream', 'disable_spinner'];

const ALL_CONFIG_KEYS: LocalConfigKey[] = [
  'stream',
  'disable_spinner',
  'agents',
  'workspace_disabled',
  'join_discord_shown',
  'api_key',
  'engine',
];

export function setCommand() {
  const config = readConfig();
  if (!config) return;

  const key = process.argv[3] as LocalConfigKey;
  let value = process.argv[4];

  if (!key || !ALL_CONFIG_KEYS.includes(key)) {
    Logger.error('Please provide a valid key to set.');
    return;
  }

  if (!value) {
    Logger.error('Please provide a value to set.');
    return;
  }

  if (KEYS_WITH_PARSING.includes(key)) {
    value = JSON.parse(value);
  }

  setValue(key, value);
  Logger.log(`${key} set successfully to ${value}.`);
}
