#!/usr/bin/env node

import { Command } from 'commander';
import os from 'os';
import { agentsCommand } from './commands/agents';
import { configCommand } from './commands/config';
import { initCommand } from './commands/init';
import { queryCommand } from './commands/query';
import { setCommand } from './commands/set';
import { tasksSubscriptionCommand } from './commands/tasks';
import { handleAutoUpdate } from './utils/cliUpdate';
import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { initPluginCredentials } from './utils/credentials';
import Logger from './utils/logger';
import { DISCORD_LINK } from './utils/messaging';
import { getTempPath2501 } from './utils/platform';
import { initPlugins } from './utils/plugins';
import { RemoteExecutor } from './remoteExecution/remoteExecutor';

// Initialize global error handlers before any other code
errorHandler.initializeGlobalHandlers();

process.on('SIGINT', async () => {
  RemoteExecutor.instance.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  RemoteExecutor.instance.disconnect();
  process.exit(0);
});

const program = new Command();
const programName = os.platform() === 'win32' ? 'a2501' : '@2501';

program
  .name(programName)
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
  .option(
    '--remote-exec <connection>',
    'Enable remote execution (user@host:port)'
  )
  .option(
    '--remote-private-key <privateKey>',
    'Path to private key for remote execution'
  )
  .option(
    '--remote-exec-type <type>',
    'Type of remote execution: ssh or winrm. (defaults to ssh)',
    'ssh'
  )
  .option('--remote-exec-password <password>', 'Password for remote execution')
  .option('--remote-skip-test <skipTest>', 'Skip the remote connection test')
  .hook('postAction', () => {
    RemoteExecutor.instance.disconnect();
  })
  .on('command:*', async (args) => {
    const query = args?.join(' ');
    if (!query) {
      Logger.log(
        'Please provide a query or use --help to see available commands'
      );
      return;
    }
    const options = program.opts();
    Logger.debug('Args:', { args, options });

    try {
      await authMiddleware();
      await queryCommand(query, options);
    } catch (error) {
      await errorHandler.handleCommandError(error as Error, 'fallback-query', {
        exitCode: 1,
      });
    }
  });

// Monkey-patch Commander.js's .action to auto-wrap all actions in try/catch
const originalAction = Command.prototype.action;
Command.prototype.action = function (fn) {
  return originalAction.call(this, function (...args) {
    // Use a regular function to preserve 'this' context
    return (async () => {
      try {
        await fn.apply(this, args);
      } catch (error) {
        await errorHandler.handleCommandError(
          error as Error,
          this.name ? this.name() : 'unknown',
          { exitCode: 1 }
        );
      }
    })();
  });
};

// Config command
program
  .command('config')
  .description('Fetch configuration from API')
  .hook('preAction', authMiddleware)
  .action(async () => {
    await configCommand();
  });

// Query command
program
  .command('query')
  .argument('<query>', 'Query to execute')
  .description('Execute a query using the specified agent')
  .option('--workspace <path>', 'Specify a different workspace path')
  .option('--agent-id <agentId>', 'Specify the agent ID')
  .option('--task-id <taskId>', 'Specify the task ID')
  .option('--stream [stream]', 'Stream the output of the query', true)
  .option('--plugins <path>', 'Path to plugins configuration file')
  .option('--env <path>', 'Path to .env file containing credentials')
  .hook('preAction', authMiddleware)
  .hook('preAction', initPlugins)
  .hook('preAction', initPluginCredentials)
  .action(async (query, options) => {
    Logger.debug('Query options:', options);
    await queryCommand(query, options);
  });

// Init command
program
  .command('init')
  .description('Initializes a new agent')
  .option('--name <name>', 'Specify the name of the agent')
  .option('--workspace <path>', 'Specify a different workspace path')
  .option(
    '--no-workspace',
    `Will not sync the current workspace and will create a temporary one in ${getTempPath2501()}`
  )
  .option('--config <configKey>', 'Specify the configuration Key to use')
  .option('--agent-id <agentId>', 'Specify the agent ID')
  .option('--task-id <taskId>', 'Specify the task ID')
  .hook('preAction', authMiddleware)
  .action(async (cmdOptions) => {
    const options = program.opts();
    const allOptions = { ...cmdOptions, ...options };
    Logger.debug('Init options:', {
      ...allOptions,
      remoteExecPassword:
        (allOptions.remoteExecPassword && '***') || '(not provided)',
    });
    await initCommand(allOptions);
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
    await agentsCommand(options);
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
    await tasksSubscriptionCommand(options);
  });

program
  .command('set')
  .description('Set a configuration value')
  .argument('<key>', 'The key to set')
  .argument('<value>', 'The value to set')
  .action(async (key, value) => await setCommand(key, value));

(async () => {
  try {
    await handleAutoUpdate();
    program.parse(process.argv);
  } catch (error) {
    await errorHandler.handleCommandError(error as Error, 'main', {
      exitCode: 0,
    });
  }
})();
