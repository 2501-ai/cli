#!/usr/bin/env node

import { Command } from 'commander';
import { configCommand } from './commands/config';
import { queryCommand } from './commands/query';
import { initCommand } from './commands/init';

const program = new Command();

program.name('2501').description('CLI to wrap an API');

// Config command
program
  .command('config')
  .description('Fetch configuration from API')
  .action(configCommand);

// Query command
program
  .command('query')
  .description('Display the current workspace and options')
  .option('--workspace <path>', 'Specify a different workspace path')
  .action(queryCommand);

// Init command
program
  .command('init')
  .description('Initializes a new agent')
  .option('--name <name>', 'Specify the name of the agent')
  .option('--workspace <path>', 'Specify a different workspace path')
  .option('--config <config_id>', 'Specify the configuration ID')
  .action(initCommand);

program.parse(process.argv);