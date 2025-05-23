#!/usr/bin/env node

import { Command } from 'commander';
import { configCommand } from './commands/config';
import { queryCommand } from './commands/query';
import { initCommand } from './commands/init';
import { agentsCommand } from './commands/agents';
import { setCommand } from './commands/set';
import { wtfCommand } from './commands/wtf';
import { tasksSubscriptionCommand } from './commands/tasks';

import { authMiddleware } from './middleware/auth';
import { isLatestVersion } from './utils/versioning';
import Logger from './utils/logger';
import { DISCORD_LINK } from './utils/messaging';
import { initPluginCredentials } from './utils/credentials';
import { initPlugins } from './utils/plugins';

process.on('SIGINT', () => {
  console.log('Process interrupted with Ctrl+C');
  process.exit(130); // Exit with code 130 (128 + 2 for SIGINT)
});

const program = new Command();

program
  .name('@2501')
  .description(
    `
░▒▓███████▓▒░░▒▓████████▓▒░▒▓████████▓▒░  ░▒▓█▓▒░ 
       ░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓████▓▒░ 
       ░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░  ░▒▓█▓▒░ 
 ░▒▓██████▓▒░░▒▓███████▓▒░░▒▓█▓▒░░▒▓█▓▒░  ░▒▓█▓▒░ 
░▒▓█▓▒░             ░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░  ░▒▓█▓▒░ 
░▒▓█▓▒░             ░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░  ░▒▓█▓▒░ 
░▒▓████████▓▒░▒▓███████▓▒░░▒▓████████▓▒░  ░▒▓█▓▒░ 
                                                  
        ---- AI Autonomous Systems ----
        
Join our Discord server: ${DISCORD_LINK}
  `
  )
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  .version(require('../package.json').version)
  .on('command:*', async (args, options) => {
    const query = args?.join(' ');
    if (!query) {
      return;
    }
    Logger.debug('Options', options);
    // @TODO : implement options support.
    await authMiddleware();
    await queryCommand(query, {
      stream: options.stream,
    });
  });

// Config command
program
  .command('config')
  .description('Fetch configuration from API')
  .hook('preAction', authMiddleware)
  .action(configCommand);

// Query command
program
  .command('query')
  .argument('<query>', 'Query to execute')
  .description('Execute a query using the specified agent')
  .option('--workspace <path>', 'Specify a different workspace path')
  .option('--agentId <id>', 'Specify the agent ID')
  .option('--stream [stream]', 'Stream the output of the query', true) // if you run it "@2501 query --stream false" - it will pass stream as 'false' string
  .option('--plugins <path>', 'Path to plugins configuration file')
  .option('--env <path>', 'Path to .env file containing credentials')
  .hook('preAction', authMiddleware)
  .hook('preAction', initPlugins)
  .hook('preAction', initPluginCredentials)
  .action(async (query, options) => {
    try {
      await queryCommand(query, options);
    } catch (error) {
      Logger.error((error as Error).message);
      process.exit(1);
    }
  });

// Init command
program
  .command('init')
  .description('Initializes a new agent')
  .option('--name <name>', 'Specify the name of the agent')
  .option('--workspace <path>', 'Specify a different workspace path')
  .option(
    '--no-workspace',
    'Will not sync the current workspace and will create a temporary one in /tmp/2501/'
  )
  .option('--config <configKey>', 'Specify the configuration Key to use')
  .hook('preAction', authMiddleware)
  .action(initCommand);

// Agents command
program
  .command('agents')
  .description(
    'List agents in the current workspace or all agents on the machine'
  )
  .option('--workspace <path>', 'Specify a different workspace path')
  .option('--all', 'Parameter to target all agents during list or flush action')
  .option('--flush', 'Flush all agents from the configuration')
  .action(agentsCommand);

// Tasks command
program
  .command('tasks')
  .description('Fetch tasks from API')
  .option('--workspace <path>', 'Specify a different workspace path')
  .option(
    '--subscribe',
    'Subscribe to the API for new tasks on the current workspace (updated every minute)'
  )
  .option(
    '--unsubscribe',
    'Unsubscribe to the API for new tasks on the current workspace'
  )
  .option('--listen', 'Listen for new tasks from the API and execute them')
  .hook('preAction', authMiddleware)
  .hook('preAction', initPlugins)
  .hook('preAction', initPluginCredentials)
  .action(tasksSubscriptionCommand);

program
  .command('set')
  .description('Set a configuration value')
  .argument('<key>', 'The key to set')
  .argument('<value>', 'The value to set')
  .action(setCommand);

program
  .command('wtf')
  .description('What the f*ck did I just do?')
  .hook('preAction', authMiddleware)
  .action(wtfCommand);

(async () => {
  const isLatest = await isLatestVersion();
  if (!isLatest) {
    Logger.log(
      'UPDATE AVAILABLE : A new version of 2501 CLI is available. Run `npm i -g @2501-ai/cli` to update'
    );
  }

  program.parse(process.argv);
})();
