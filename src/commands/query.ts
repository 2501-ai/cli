import axios from 'axios';
import { terminal } from 'terminal-kit';
import { jsonrepair } from 'jsonrepair';
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

import { TaskManager } from '../utils/taskManager';
import { listAgentsFromWorkspace, readConfig } from '../utils/conf';
import { convertFormToJSON } from '../utils/json';
import { API_HOST, API_VERSION } from '../constants';

import * as actionsFns from '../utils/actions';

import { initCommand } from './init';

marked.use(markedTerminal() as any);

enum QueryStatus {
  Completed = 'completed',
  Failed = 'failed',
}

class Agent {
  id: string;
  name: string;
  engine: string;
  workspace: string;
  callback?: any;

  spinner: any;

  constructor(options: {
    id: string;
    name: string;
    engine: string;
    workspace: string;
    callback?: any;
  }) {
    this.id = options.id;
    this.name = options.name;
    this.engine = options.engine;
    this.workspace = options.workspace;
    this.callback = options.callback;
  }

  async toggleLoader(destroy: boolean = false) {
    if (this.spinner || destroy) {
      this.spinner && this.spinner.animate(false);
      this.spinner = null;
    } else {
      this.spinner = await terminal.spinner();
    }
  }

  async checkStatus() {
    try {
      const config = await readConfig();
      const { data } = await axios.get(
        `${API_HOST}${API_VERSION}/agents/${this.id}/status`,
        {
          headers: {
            Authorization: `Bearer ${config?.api_key}`,
          },
        }
      );

      if (data.answer || data.response) {
        this.toggleLoader(true);
        terminal.bold('\n\nAGENT:\n');
        terminal(marked.parse(data.answer || data.response));
      }

      if (data.status === QueryStatus.Completed) {
        this.toggleLoader(true);
        this.callback && await this.callback(data.answer || data.response);
        return process.exit(0);
      }

      if (data.status === QueryStatus.Failed) {
        console.error('Query failed:', data.error);
        this.callback && await this.callback(data.answer || data.error);
        return process.exit(0);
      }

      if (data.actions) {
        this.toggleLoader(true);
        await this.processActions(data.actions);
        return;
      }
    } catch (error: any) {
      console.error(
        'Error checking query status:',
        error.message,
        '\n Retrying...'
      );
    }

    const self = this;
    setTimeout(async () => await self.checkStatus(), 2000);
  }

  async processActions(actions: any[]) {
    const taskManager = new TaskManager();
    const tool_outputs: any[] = [];
    for (const call of actions) {
      let args: any;

      if (call.function.arguments) {
        args = call.function.arguments;
        if (typeof args === 'string') {
          const fixed_args = jsonrepair(args);
          args = JSON.parse(convertFormToJSON(fixed_args));
        }
      } else {
        args = call.args;
      }

      const functions = actionsFns as any;
      const function_name = call.function.name || call.function;

      let task: string = args.answer || args.command || '';
      if (args.url) {
        task = 'Browsing: ' + args.url;
      }

      await taskManager.run(task, async () => {
        try {
          const output = await functions[function_name](args);
          tool_outputs.push({
            tool_call_id: call.id,
            output,
          });
        } catch (e: any) {
          tool_outputs.push({
            tool_call_id: call.id,
            output: `I failed to run ${function_name}, please fix the situation, errors below.\n ${e.message}`,
          });
        }
      });
    }

    if (this.engine.includes('rhino')) {
      try {
        const config = await readConfig();
        await axios.post(
          `/agents/${this.id}/submitOutput`,
          {
            tool_outputs,
          },
          {
            headers: {
              Authorization: `Bearer ${config?.api_key}`,
            },
          }
        );
        const self = this;
        setTimeout(async () => await self.checkStatus(), 2000);
      } catch (e) {
        this.checkStatus();
      }
    } else {
      queryCommand(
        `
      Find below the output of the actions in the task context, if you're done on the main task and its related subtasks, you can stop and wait for my next instructions.
      Output :
      ${tool_outputs.map((o) => o.output).join('\n')}`,
        {
          agentId: this.id,
          workspace: process.cwd(),
          skipWarmup: true,
        }
      );
    }
    return;
  }
}

// Function to execute the query command
export async function queryCommand(
  query: string,
  options: {
    workspace?: string;
    agentId?: string;
    skipWarmup?: boolean;
    callback?: any;
  }
): Promise<void> {
  const workspace = options.workspace || process.cwd();
  const agentId = options.agentId;
  const skipWarmup = options.skipWarmup;

  const agents = await listAgentsFromWorkspace(workspace);
  const eligible =
    agents.find((a) => a.id === agentId) || agents[0] || null;

  if (!skipWarmup) {
    if (!eligible) {
      const taskManager = new TaskManager();
      terminal.yellow(
        'Warn: no agent found in the specified workspace, initializing...'
      );
      await taskManager.run('Initializing agent', initCommand);
      await taskManager.run(
        'Warming up... can take a few seconds.',
        async () => new Promise((resolve) => setTimeout(resolve, 5000))
      );

      await queryCommand(query, options);
      return;
    }
    terminal.grey(`INFO: Current workspace: ${workspace}`);
    terminal('\n');
  }

  const agent = new Agent({
    id: eligible.id,
    name: eligible.name,
    engine: eligible.engine,
    callback: options.callback,
    workspace,
  });

  try {
    agent.toggleLoader();
    const config = await readConfig();
    const { data } = await axios.post(
      `${API_HOST}${API_VERSION}/agents/${agent.id}/query`,
      { query },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config?.api_key}`,
        },
        timeout: 5 * 60 * 1000,
      }
    );

    if (data.asynchronous) {
      return agent.checkStatus();
    }

    if (data.response) {
      terminal.bold('AGENT:\n');
      terminal(marked.parse(data.response));
    }

    if (data.actions) {
      return await agent.processActions(data.actions);
    }

    process.exit(0);
  } catch (error: any) {
    console.error('Error querying agent:', error.message);
    process.exit(0);
  }
}