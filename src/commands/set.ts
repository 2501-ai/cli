import { Config, readConfig, setValue } from '../utils/conf';

export async function setCommand() {
  const config = await readConfig();
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

  await setValue(key as keyof Config, value);
  console.log(`${key} set successfully.`);
}
