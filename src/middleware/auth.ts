import Logger from '../utils/logger';
import { readConfig } from '../utils/conf';

export function authMiddleware() {
  const config = readConfig();
  if (!config || !config.api_key) {
    Logger.log(
      'Please run the command `@2501 set api_key {YOUR_API_KEY}` to configure the API key before running any other command.'
    );
    process.exit(1);
  }
}
