import axios from 'axios';
import { terminal } from 'terminal-kit';
import { jsonrepair } from 'jsonrepair';

import { TaskManager } from '../utils/taskManager';
import { listAgentsFromWorkspace } from '../utils/conf';
import { convertFormToJSON } from '../utils/json';
import { API_HOST, API_VERSION } from '../constants';

import * as actionsFns from '../utils/actions';

class Agent {
  id: string;
  name: string;
  main_engine: string;

  loader: any;

  constructor(options: { id: string; name: string; main_engine: string }) {
    this.id = options.id;
    this.name = options.name;
    this.main_engine = options.main_engine;
  }

  toggleLoader(destroy: boolean = false) {
    if (this.loader || destroy) {
      this.loader.distroy();
      this.loader = null;
    } else {
      this.loader = terminal.spinner();
    }
  }

  async checkStatus() {
    try {
      const { data } = await axios.get(
        `${API_HOST}${API_VERSION}/agents/${this.id}/status`
      );

      if (data.answer || data.response) {
        this.toggleLoader(true);
        console.log('\nAgent:', data.answer || data.response);
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

    if (this.main_engine.includes('openai/gpt4')) {
      try {
        await axios.post(`/agents/${this.id}/submitOutput`, {
          tool_outputs,
        });
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
) {
  const workspace = options.workspace || process.cwd();
  console.log(`Current workspace: ${workspace}`);

  const agents = await listAgentsFromWorkspace(workspace);
  const eligible =
    agents.find((a) => a.id === options.agentId) || agents[0] || null;

  if (!eligible) {
    console.error('No agent found in the specified workspace.');
    return;
  }

  const agent = new Agent({
    id: eligible.id,
    name: eligible.name,
    main_engine: eligible.main_engine,
  });

  try {
    agent.toggleLoader();
    const { data } = await axios.post(
      `${API_HOST}${API_VERSION}/agents/${agent.id}/query`,
      { query },
      { timeout: 5 * 60 * 1000 }
    );

    if (data.asynchronous) {
      return agent.checkStatus();
    }

    if (data.response) {
      console.log('Agent:', data.response);
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
