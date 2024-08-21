import axios from 'axios';
import { terminal } from 'terminal-kit';
import { jsonrepair } from 'jsonrepair';

import { TaskManager } from './utils/taskManager';
import { convertFormToJSON } from './utils/json';
import {
  browse_url,
  hasError,
  read_file,
  run_shell,
  update_file_content,
  write_file,
} from './utils/actions';
import { readConfig } from './utils/conf';

import {
  API_HOST,
  API_VERSION,
  OPENAI_TERMINAL_STATUSES,
  QueryStatus,
} from './constants';
import { Logger } from './utils/logger';

let debugData: any = '';

const MAX_RETRY = 3;

const ACTION_FNS = {
  hasError,
  browse_url,
  read_file,
  run_shell,
  write_file,
  update_file_content,
};

export type AgentCallbackType = (...args: unknown[]) => Promise<void>;

export class AgentManager {
  id: string;
  name: string;
  engine: string;
  workspace: string;
  callback?: AgentCallbackType;

  spinner: any;
  queryCommand: (...args: any[]) => Promise<void>;

  errorRetries = 0;

  constructor(options: {
    id: string;
    name: string;
    engine: string;
    workspace: string;
    callback?: AgentCallbackType;
    queryCommand: (...args: any[]) => Promise<void>;
  }) {
    this.id = options.id;
    this.name = options.name;
    this.engine = options.engine;
    this.workspace = options.workspace;
    this.callback = options.callback;
    this.queryCommand = options.queryCommand;
  }

  async toggleLoader(destroy: boolean = false) {
    try {
      if (this.spinner || destroy) {
        this.spinner && this.spinner.animate(false);
        this.spinner = null;
      } else {
        this.spinner = await terminal.spinner();
      }
    } catch (e) {
      Logger.warn('Error toggling loader', e);
    }
  }

  async checkStatus() {
    try {
      const config = readConfig();
      const { data } = await axios.get(
        `${API_HOST}${API_VERSION}/agents/${this.id}/status`,
        {
          headers: {
            Authorization: `Bearer ${config?.api_key}`,
          },
        }
      );

      if (data.answer || data.response) {
        await this.toggleLoader(true);
        Logger.agent(data.answer || data.response);
      }

      if (data.status === QueryStatus.Completed) {
        await this.toggleLoader(true);
        this.callback && (await this.callback(data.answer || data.response));
        return process.exit(0);
      }

      if (data.status === QueryStatus.Failed) {
        console.error('Query failed:', data.error);
        this.callback && (await this.callback(data.answer || data.error));
        return process.exit(0);
      }

      if (OPENAI_TERMINAL_STATUSES.includes(data.status)) {
        await this.toggleLoader(true);
        Logger.debug('Unhandled status', data.status);
        Logger.debug('Data', data);
        Logger.warn('TODO: Implement action required');
        return process.exit(1);
      }

      if (data.actions) {
        debugData = data;
        await this.toggleLoader(true);
        await this.processActions(data.actions);
        return process.exit(0);
      }
    } catch (error: any) {
      console.error(
        'Error checking query status:',
        error.message,
        '\n Retrying...'
      );
      this.errorRetries++;

      // Try to log debugData if available
      try {
        if (error.message === 'Unexpected end of JSON input') {
          const fixed_args = jsonrepair(debugData);
          debugData = JSON.parse(convertFormToJSON(fixed_args));
        } else {
          Logger.debug('debugData', JSON.stringify(debugData));
        }
      } catch (e) {
        Logger.error('Error logging debugData', e);
        return process.exit(1);
      }
      // Prevent infinite loop
      if (this.errorRetries > MAX_RETRY) {
        Logger.error('Max retries reached, exiting...');
        process.exit(1);
      }
    }
    setTimeout(async () => await this.checkStatus.call(this), 3000);
  }

  async processActions(actions: any[], asynchronous: boolean = true) {
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

      const function_name: keyof typeof ACTION_FNS =
        call.function.name || call.function;

      let task: string = args.answer || args.command || '';
      if (args.url) {
        task = 'Browsing: ' + args.url;
      }

      let corrected = false;
      if (args.path && args.content) {
        await taskManager.run('Checking output for correction', async () => {
          const previous =
            ACTION_FNS.read_file({ path: args.path }) || 'NO PREVIOUS VERSION';
          try {
            const config = readConfig();
            const { data: correctionData } = await axios.post(
              `/agents/${this.id}/verifyOutput`,
              { task, previous, proposal: args.content },
              {
                timeout: 60000,
                headers: {
                  Authorization: `Bearer ${config?.api_key}`,
                },
              }
            );

            if (
              correctionData.corrected_output &&
              correctionData.corrected_output !== args.content
            ) {
              corrected = true;
              args.content = correctionData.corrected_output;
            }
          } catch (e) {
            console.error('verifyOutput error or timeout', e);
          }
        });
      }

      await taskManager.run(task, async () => {
        try {
          let output = await ACTION_FNS[function_name](args);
          if (corrected) {
            output += `\n\n NOTE: your original content for ${args.path} was corrected with the new version below before running the function: \n\n${args.content}`;
          }
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

    if (this.engine.includes('rhino') && asynchronous) {
      try {
        const config = readConfig();
        await axios.post(
          `${API_HOST}${API_VERSION}/agents/${this.id}/submitOutput`,
          {
            tool_outputs,
          },
          {
            headers: {
              Authorization: `Bearer ${config?.api_key}`,
            },
          }
        );
        // add a 2 sec delay
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await this.checkStatus();
      } catch (e) {
        await this.checkStatus();
      }
    } else {
      await this.queryCommand(
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
