import axios from 'axios';
// import { terminal } from 'terminal-kit';
import { jsonrepair } from 'jsonrepair';
import { convertFormToJSON } from '../utils/json';
import {
  browse_url,
  hasError,
  read_file,
  run_shell,
  update_file,
  write_file,
} from '../helpers/actions';
import { readConfig } from '../utils/conf';

import {
  API_HOST,
  API_VERSION,
  OPENAI_TERMINAL_STATUSES,
  QueryStatus,
} from '../constants';
import { Logger } from '../utils/logger';
import { ListrTask } from 'listr2';

const MAX_RETRY = 3;

const ACTION_FNS = {
  hasError,
  browse_url,
  read_file,
  run_shell,
  write_file,
  update_file,
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

  async checkStatus(): Promise<ListrTask[]> {
    let debugData: any = '';
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

      Logger.debug('Check status', data);
      if (data.answer || data.response) {
        Logger.agent(data.answer || data.response);
      }

      if (data.status === QueryStatus.Completed) {
        this.callback && (await this.callback(data.answer || data.response));
        return [];
      }

      if (data.status === QueryStatus.Failed) {
        Logger.error('Query failed:', data.error);
        this.callback && (await this.callback(data.answer || data.error));
      }

      if (OPENAI_TERMINAL_STATUSES.includes(data.status)) {
        Logger.debug('Unhandled status', data.status);
        Logger.debug('Data', data);
        Logger.warn('TODO: Implement action required');
        return process.exit(1);
      }

      if (data.actions) {
        debugData = data;
        return this.getProcessActionsTasks(data.actions);
      }
    } catch (error: any) {
      Logger.error(
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

    await new Promise((resolve) => setTimeout(resolve, 2000));
    return this.checkStatus();
  }

  getProcessActionsTasks(
    actions: any[],
    asynchronous: boolean = true
  ): ListrTask[] {
    Logger.debug('PROCESS ACTIONS', actions);
    const tasks: ListrTask<{
      toolOutputs: {
        tool_call_id: string;
        output: string;
      }[];
    }>[] = [];

    tasks.push({
      title: 'Processing actions..',
      task: async (ctx, task) => {
        ctx.toolOutputs = [];
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

          task.output = `PROCESS ACTIONS args: ${args}`;

          const function_name: keyof typeof ACTION_FNS =
            call.function.name || call.function;

          let taskTitle: string = args.answer || args.command || '';
          if (args.url) {
            taskTitle = 'Browsing: ' + args.url;
          }

          let corrected = false;
          if (args.path && args.content) {
            task.output = `Checking output for correction..`;
            const previous =
              ACTION_FNS.read_file({ path: args.path }) ||
              'NO PREVIOUS VERSION';

            // const proposal = args.updates
            //   ? ACTION_FNS.update_file({
            //       path: args.path,
            //       updates: args.updates,
            //       write: false,
            //     })
            //   : args.content;

            try {
              const config = readConfig();
              const { data: correctionData } = await axios.post(
                `/agents/${this.id}/verifyOutput`,
                { task: taskTitle, previous, proposal: args.content },
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

                // if (args.updates) {
                //   delete args.updates;
                //   function_name = ACTION_FNS.write_file.name as typeof function_name;
                // }
              }
            } catch (e) {
              Logger.error('verifyOutput error or timeout', e);
              throw e;
            }
          }

          task.output = `Processing action: ${taskTitle} | On function ${function_name}`;
          Logger.debug(
            `Processing action: ${taskTitle} | On function ${function_name}`
          );
          try {
            let output = (await ACTION_FNS[function_name](args)) as string;

            if (corrected) {
              output += `\n\n NOTE: your original content for ${args.path} was corrected with the new version below before running the function: \n\n${args.content}`;
            }

            ctx.toolOutputs.push({
              tool_call_id: call.id,
              output,
            });
          } catch (e: any) {
            Logger.debug('Error processing action:', e);
            ctx.toolOutputs.push({
              tool_call_id: call.id,
              output: `I failed to run ${function_name}, please fix the situation, errors below.\n ${e.message}`,
            });
          }
        }
      },
    });

    if (this.engine.includes('rhino') && asynchronous) {
      tasks.push({
        title: 'Submitting output..',
        task: async (ctx, subtask) => {
          try {
            const config = readConfig();
            await axios.post(
              `${API_HOST}${API_VERSION}/agents/${this.id}/submitOutput`,
              {
                tool_outputs: ctx.toolOutputs,
              },
              {
                headers: {
                  Authorization: `Bearer ${config?.api_key}`,
                },
              }
            );
            // add a 2 sec delay
            await new Promise((resolve) => setTimeout(resolve, 2000));
            return subtask.newListr(await this.checkStatus());
          } catch (e) {
            return subtask.newListr(await this.checkStatus());
          }
        },
      });
    } else {
      tasks.push({
        title: 'Querying for next actions..',
        task: async (ctx, task) => {
          return task.newListr([
            {
              title: 'reviewing..',
              task: async () => {
                await this.queryCommand(
                  `
        Find below the output of the actions in the task context, if you're done on the main task and its related subtasks, you can stop and wait for my next instructions.
        Output :
        ${ctx.toolOutputs.map((o: { output: string }) => o.output).join('\n')}`,
                  {
                    agentId: this.id,
                    workspace: process.cwd(),
                    skipWarmup: true,
                  }
                );
              },
            },
          ]);
        },
      });
    }

    return tasks;
  }
}
