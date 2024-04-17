#!/usr/bin/env node

import { Command } from 'commander';
import { configCommand } from './commands/config';
import { queryCommand } from './commands/query'; 
import { initCommand } from './commands/init';
import { agentsCommand } from './commands/agents';

const program = new Command();

program.name('2501').description('An AI to rule your systems');

// Config command
program
  .command('config')  
  .description('Fetch configuration from API')
  .action(configCommand);

// Query command  
program
  .command('query <query>')
  .description('Execute a query using the specified agent')
  .option('--workspace <path>', 'Specify a different workspace path')
  .option('--agentId <id>', 'Specify the agent ID')
  .action(queryCommand);

// Init command
program  
  .command('init')
  .description('Initializes a new agent')
  .option('--name <name>', 'Specify the name of the agent')
  .option('--workspace <path>', 'Specify a different workspace path') 
  .option('--config <config_id>', 'Specify the configuration ID')
  .action(initCommand);

// Agents command
program
  .command('agents')
  .description('List agents in the current workspace or all agents on the machine')
  .option('--workspace <path>', 'Specify a different workspace path')
  .option('--all', 'List all agents on the machine')
  .option('--flush', 'Flush all agents from the configuration')
  .action(agentsCommand);

program.parse(process.argv);