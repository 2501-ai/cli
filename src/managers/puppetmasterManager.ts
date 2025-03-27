import fs from 'fs';
import path from 'path';
import { terminal } from 'terminal-kit';

import Logger from '../utils/logger';
import {
  getPuppetMasterPlans,
  getPuppetMasterAgentMemory,
} from '../helpers/api';

import { agentsCommand } from '../commands/agents';
import { initCommand } from '../commands/init';
import { runAgent } from '../commands/query';

const SHARED_MEMORY_FILE = 'sharedMemory.md';

interface PuppetStep {
  task: string;
  configuration_key: string;
}

interface PuppetMasterOptions {
  query: string;
  workspace: string;
  agentOptions: {
    workspace?: string;
    agentId?: string;
    skipWarmup?: boolean;
    stream?: boolean;
    callback?: (...args: any[]) => Promise<void>;
    noPersistentAgent?: boolean;
  };
}

function getSharedMemory(workspace: string) {
  const filePath = path.join(workspace, '.2501', SHARED_MEMORY_FILE);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
}

function updateSharedMemory(workspace: string, memory: string) {
  const dirPath = path.join(workspace, '.2501');
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath);
  }
  const filePath = path.join(dirPath, SHARED_MEMORY_FILE);
  fs.writeFileSync(filePath, memory);
}

export class PuppetmasterManager {
  query: string;
  workspace: string;
  agentOptions: any;

  constructor(options: PuppetMasterOptions) {
    this.query = options.query;
    this.workspace = options.workspace;
    this.agentOptions = options.agentOptions;
  }

  async plan() {
    Logger.log('Info - Puppet Alpha is enabled, plan will appear below.\n\n'); // @TODO: to remove or put debug
    const { steps } = await getPuppetMasterPlans(this.query);

    // Logger.log(
    //   'Plan:',
    //   steps
    //     .map(
    //       (step: any, idx: number) =>
    //         `Agent ${idx + 1} - ${step.task} (${step.configuration_key})`
    //     )
    //     .join('\n')
    // );
    // Logger.log('\n');

    terminal.table(
      [
        ['Agent', 'Task', 'Configuration'],
        ...steps.map((step: any) => [
          steps.indexOf(step) + 1,
          step.task,
          step.configuration_key,
        ]),
      ],
      {
        hasBorder: true,
        contentHasMarkup: true,
        borderChars: 'lightRounded',
        borderAttr: { color: 'red' },
        textAttr: { bgColor: 'default' },
        firstRowTextAttr: { bgColor: 'red' },
        width: 80,
        fit: true,
      }
    );

    return steps;
  }

  async run() {
    const steps = await this.plan();
    for (const step of steps) {
      await this.runStep(step, steps);
    }
  }

  async runStep(step: PuppetStep, steps: PuppetStep[]) {
    const task = `
        You are about to run the following task:
        <TASK>
        ${step.task}
        </TASK>

        Original query (parent task):
        <PARENT_TASK>
        ${this.query}
        </PARENT_TASK>

        Below is the current memory shared between past-agents on the original query.
        <MEMORY>
        ${getSharedMemory(this.workspace)}
        </MEMORY>

        You are part of a chain of agents 
        <AGENTS_CHAIN>
        ${steps
          .map(
            (s, idx) =>
              `Agent ${idx + 1} ${s.task === step.task ? '(YOU)' : ''} - ${s.task} (${s.configuration_key})`
          )
          .join('\n')}
        </AGENTS_CHAIN>
    `;

    Logger.log('Current Agent:');

    terminal.table(
      [
        ['Agent', 'Task', 'Configuration'],
        ['0', step.task, step.configuration_key],
      ],
      {
        hasBorder: true,
        contentHasMarkup: true,
        borderChars: 'lightRounded',
        borderAttr: { color: 'grey' },
        textAttr: { bgColor: 'default' },
        firstRowTextAttr: { bgColor: 'grey' },
        width: 80,
        fit: true,
      }
    );

    await agentsCommand({ flush: true });

    const agent = await initCommand({
      config: step.configuration_key,
      workspace: this.workspace,
    });

    await runAgent(task, this.agentOptions);

    const sharedMemory = getSharedMemory(this.workspace);
    const memory = await getPuppetMasterAgentMemory(agent.id, sharedMemory);
    updateSharedMemory(this.workspace, memory);
  }
}
