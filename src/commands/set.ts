import { Config, readConfig, setValue } from '../utils/conf';

export function setCommand() {
  const config = readConfig();
  if (!config) return;

  const key = process.argv[3];
  const value = process.argv[4];

  if (!key) {
    console.error('Please provide a key to set.');
    return;
  }

  if (!value) {
    console.error('Please provide a value to set.');
    return;
  }

  setValue(key as keyof Config, value);
  console.log(`${key} set successfully.`);
}
