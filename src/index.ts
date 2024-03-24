#!/usr/bin/env node

import { Command } from 'commander';
import { configCommand } from './commands/config';
import { queryCommand } from './commands/query';

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

program.parse(process.argv);
