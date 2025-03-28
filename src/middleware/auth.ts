import { terminal } from 'terminal-kit';
import { readConfig, writeConfig } from '../utils/conf';
import Logger from '../utils/logger';
import { initAxios } from '../helpers/api';

const logger = new Logger();

export async function authMiddleware() {
  let config = readConfig();
  // Show the first time setup message if the user has not configured the API key
  if (config && !config.api_key && !config.agents.length) {
    await showFirstTimeMessage();
    config = readConfig();
  }

  if (config && !config.api_key) {
    terminal.bold.red(
      'Please run the command `@2501 set api_key {YOUR_API_KEY}` to configure the API key before running any other command.\nIf you do not have an API key, you can get one by signing up at https://accounts.2501.ai/pay\n'
    );
    process.exit(1);
  }
  await initAxios();
}

async function showFirstTimeMessage() {
  logger.log(`Welcome to @2501 CLI!
It looks like this is your first time using the CLI.

Before we begin, you need to configure your API key. (You can get your API key by signing up at https://accounts.2501.ai)`);

  const res = await logger.prompt(
    `Once you have registered, please enter your API key here: `,
    'string'
  );
  if (res) {
    writeConfig({
      api_key: res,
      workspace_disabled: false,
      agents: [],
      join_discord_shown: false,
      disable_spinner: true,
    });

    logger.log(
      `The CLI will now create a workspace and synchronize your files with the 2501 platform before creating your first agent.`
    );
  }
}
