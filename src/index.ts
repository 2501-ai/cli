#!/usr/bin/env node

import { Command } from 'commander';
import { configCommand } from './commands/config';
import { queryCommand } from './commands/query';
import { initCommand } from './commands/init';
import { agentsCommand } from './commands/agents';
import { setCommand } from './commands/set';

import { authMiddleware } from './middleware/auth';

const program = new Command();

program
  .name('@2501')
  .description('An AI to rule your systems')
  .version('0.0.1')
  .on('command:*', async (...args) => {
    const query = args[0] && args[0].join(' ');
    // @TODO : implement options support.
    authMiddleware();
    await queryCommand(query, {});
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
  .hook('preAction', authMiddleware)
  .action(queryCommand);

// Init command
program
  .command('init')
  .description('Initializes a new agent')
  .option('--name <name>', 'Specify the name of the agent')
  .option('--workspace <path>', 'Specify a different workspace path')
  .option('--config <config_id>', 'Specify the configuration ID')
  .hook('preAction', authMiddleware)
  .action(initCommand);

// Agents command
program
  .command('agents')
  .description(
    'List agents in the current workspace or all agents on the machine'
  )
  .option('--workspace <path>', 'Specify a different workspace path')
  .option('--all', 'List all agents on the machine')
  .option('--flush', 'Flush all agents from the configuration')
  .action(agentsCommand);

program
  .command('set')
  .description('Set a configuration value')
  .argument('<key>', 'The key to set')
  .argument('<value>', 'The value to set')
  .action(setCommand);

program.parse(process.argv);
