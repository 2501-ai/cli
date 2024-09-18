import { terminal } from 'terminal-kit';
import { readConfig } from '../utils/conf';

export function authMiddleware() {
  const config = readConfig();
  if (!config || !config.api_key) {
    terminal.bold.red(
      'Please run the command `@2501 set api_key {YOUR_API_KEY}` to configure the API key before running any other command.\nIf you do not have an API key, you can get one by signing up at https://accounts.2501.ai/pay\n'
    );
    process.exit(1);
  }
}
