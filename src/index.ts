#!/usr/bin/env node

import { Command } from 'commander';
import { agentsCommand } from './commands/agents';
import { configCommand } from './commands/config';
import { initCommand } from './commands/init';
import { queryCommand } from './commands/query';
import { setCommand } from './commands/set';
import { tasksSubscriptionCommand } from './commands/tasks';

import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { TelemetryManager } from './managers/telemetryManager';
import { initPluginCredentials } from './utils/credentials';
import Logger from './utils/logger';
import { DISCORD_LINK } from './utils/messaging';
import { initPlugins } from './utils/plugins';
import { isLatestVersion } from './utils/versioning';

// Initialize global error handlers before any other code
errorHandler.initializeGlobalHandlers();

process.on('SIGINT', async () => {
  await TelemetryManager.instance.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await TelemetryManager.instance.shutdown();
  process.exit(0);
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
  .on('*', (commandName) => {
    Logger.error(`Unknown command: ${commandName}`);
    Logger.log('Run @2501 --help to see available commands');
    process.exit(1);
  })
  .hook('postAction', async () => {
    // The shutdown makes sure the Telemetry timer is cleared, to allow the process to exit.
    await TelemetryManager.instance.shutdown();
  })
  .on('command:*', async (args, options) => {
    const query = args?.join(' ');
    if (!query) {
      Logger.log(
        'Please provide a query or use --help to see available commands'
      );
      return;
    }

    try {
      await authMiddleware();
      await queryCommand(query, {
        stream: options.stream,
      });
    } catch (error) {
      await errorHandler.handleCommandError(error as Error, 'fallback-query', {
        exitCode: 1,
      });
    }
  });

// Config command
program
  .command('config')
  .description('Fetch configuration from API')
  .hook('preAction', authMiddleware)
  .action(async () => {
    try {
      await configCommand();
    } catch (error) {
      await errorHandler.handleCommandError(error as Error, 'config', {
        exitCode: 1,
      });
    }
  });

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
      await errorHandler.handleCommandError(error as Error, 'query', {
        exitCode: 1,
      });
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
  .action(async (options, command) => {
    try {
      console.log('initCommand', options);
      await initCommand(options);
    } catch (error) {
      await errorHandler.handleCommandError(error as Error, command.name(), {
        exitCode: 1,
      });
    }
  });

// Agents command
program
  .command('agents')
  .description(
    'List agents in the current workspace or all agents on the machine'
  )
  .option('--workspace <path>', 'Specify a different workspace path')
  .option('--all', 'Parameter to target all agents during list or flush action')
  .option('--flush', 'Flush all agents from the configuration')
  .action(async (options) => {
    try {
      await agentsCommand(options);
    } catch (error) {
      await errorHandler.handleCommandError(error as Error, 'agents', {
        exitCode: 1,
      });
    }
  });

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
  .action(async (options) => {
    try {
      await tasksSubscriptionCommand(options);
    } catch (error) {
      await errorHandler.handleCommandError(error as Error, 'tasks', {
        exitCode: 1,
      });
    }
  });

program
  .command('set')
  .description('Set a configuration value')
  .argument('<key>', 'The key to set')
  .argument('<value>', 'The value to set')
  .action(async (key, value) => {
    try {
      await setCommand(key, value);
    } catch (error) {
      await errorHandler.handleCommandError(error as Error, 'set', {
        exitCode: 1,
      });
    }
  });

(async () => {
  try {
    const isLatest = await isLatestVersion();
    if (!isLatest) {
      Logger.log(
        'UPDATE AVAILABLE : A new version of 2501 CLI is available. Run `npm i -g @2501-ai/cli` to update'
      );
    }

    program.parse(process.argv);
  } catch (error) {
    await errorHandler.handleCommandError(error as Error, 'main', {
      exitCode: 1,
    });
  }
})();
