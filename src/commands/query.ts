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

class Agent {
  id: string;
  name: string;
  engine: string;

  spinner: any;

  constructor(options: { id: string; name: string; engine: string }) {
    this.id = options.id;
    this.name = options.name;
    this.engine = options.engine;
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

      if (data.status === 'completed') {
        this.toggleLoader(true);
        return process.exit(0);
      }

      if (data.status === 'failed') {
        console.error('Query failed:', data.error);
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
    let tool_outputs: any[] = [];
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
      // if (args.path && args.content && verification_active.value) {
      //   const previous = await window.electronAPI.getFileFromWorkspace(args.path);
      //   try {
      //     const { data: correctionData } = await axios.post(
      //       `/agents/${agent.value.db_id}/verifyOutput`,
      //       {
      //         task: args.answer || currentInput.value,
      //         previous,
      //         proposal: args.content,
      //       },
      //       { timeout: 60000 }
      //     );

      //     if (
      //       correctionData.corrected_output &&
      //       correctionData.corrected_output !== args.content
      //     ) {
      //       args.content = correctionData.corrected_output;
      //     }
      //   } catch (e) {
      //     console.error('verifyOutput error or timeout', e);
      //   }
      // }

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
      // for (const o of output) {
      //   if (o.output && !!o.output.length) {
      //     appendMessage(
      //       'verbose',
      //       args.url ? `Analysing ${args.url}` : o.output
      //     );
      //   }
      // }
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
      // console.log('tool_outputs', tool_outputs);
      // queryAgent(
      //   `here is the output of the actions: ${tool_outputs
      //     .map((o) => o.output)
      //     .join('\n')}`
      // );
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
  }
): Promise<void> {
  const workspace = options.workspace || process.cwd();

  const agents = await listAgentsFromWorkspace(workspace);
  const eligible =
    agents.find((a) => a.id === options.agentId) || agents[0] || null;

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

  const agent = new Agent({
    id: eligible.id,
    name: eligible.name,
    engine: eligible.engine,
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
        timeout: 5 * 60 * 1000 
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
