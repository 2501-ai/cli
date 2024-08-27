import axios from 'axios';
import { marked, MarkedExtension } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { ListrTask } from 'listr2';

import { TaskManager } from '../managers/taskManager';
import { AgentConfig, getEligibleAgents, readConfig } from '../utils/conf';
import { API_HOST, API_VERSION } from '../constants';

import { getInitTaskList } from './init';
import { AgentManager } from '../managers/agentManager';
import { Logger } from '../utils/logger';
import { synchroniseWorkspaceChanges } from '../helpers/workspace';
import { queryAgent, QueryResponseDTO } from '../helpers/api';
import { getActionTaskList } from '../tasks/actions';

marked.use(markedTerminal() as MarkedExtension);

export type TaskCtx = {
  agentResponse: QueryResponseDTO;
  agentManager: AgentManager;
  changed?: boolean;
  eligible?: AgentConfig | null;
  toolOutputs?: any[];
};

export function getQueryTaskList(
  options: {
    workspace?: string;
    agentId?: string;
    skipWarmup?: boolean;
    callback?: (...args: any[]) => Promise<void>;
    noPersistentAgent?: boolean;
  },
  query: string
): ListrTask<TaskCtx>[] {
  const workspace = options.workspace || process.cwd();
  const agentId = options.agentId;
  const skipWarmup = options.skipWarmup;

  return [
    {
      rendererOptions: {
        collapseSubtasks: true,
      },
      task: async (ctx, task) => {
        // subtask.title = 'Syncing..';
        ctx.eligible = getEligibleAgents(agentId, workspace);
        // initialize agent if not found
        if (!ctx.eligible && !skipWarmup) {
          task.title = 'Initializing workspace..';
          // return TaskManager.addTask(getInitTaskList({ workspace }))
          return task.newListr(getInitTaskList({ workspace }));
        }
      },
    },
    {
      // title: 'Syncing workspace..',
      task: async (ctx, subtask) => {
        ctx.eligible = getEligibleAgents(agentId, workspace);
        if (!ctx.eligible) {
          throw new Error('No agent found');
        }

        subtask.output = `Using agent: (${ctx.eligible.id})`;

        const agentManager = new AgentManager({
          id: ctx.eligible.id,
          name: ctx.eligible.name,
          engine: ctx.eligible.engine,
          callback: options.callback,
          workspace,
          queryCommand,
        });
        ctx.agentManager = agentManager;
        ctx.changed = await synchroniseWorkspaceChanges(
          agentManager.id,
          workspace
        );
        if (ctx.changed) {
          subtask.title = `Workspace synchronised`;
        }
      },
    },
    {
      task: async (ctx, task) => {
        if (ctx.changed === undefined) {
          throw new Error('Workspace not synchronized');
        }
        try {
          task.title = 'Thinking...';
          Logger.debug('Querying agent..', ctx.agentManager.id);
          ctx.agentResponse = await queryAgent(
            ctx.agentManager.id,
            ctx.changed,
            query
          );
          task.title = ctx.agentResponse.response || task.title;

          if (ctx.agentResponse.asynchronous === true) {
            const status = await ctx.agentManager.checkStatus();
            if (status?.actions) {
              ctx.agentResponse.actions = status.actions;
            }
          }

          if (ctx.agentResponse.response) {
            Logger.agent(ctx.agentResponse.response);
            task.title = ctx.agentResponse.response;
          }
        } catch (e) {
          Logger.error('Query Error :', e);
        }
      },
    },
    {
      task: async (ctx, task) => {
        const finalCheck: ListrTask = {
          task: async (_, subtask) => {
            if (
              ctx.agentManager.engine.includes('rhino') &&
              ctx.agentResponse.asynchronous
            ) {
              try {
                const config = readConfig();
                await axios.post(
                  `${API_HOST}${API_VERSION}/agents/${ctx.agentManager.id}/submitOutput`,
                  {
                    tool_outputs: ctx.toolOutputs,
                  },
                  {
                    headers: {
                      Authorization: `Bearer ${config?.api_key}`,
                    },
                  }
                );

                // Reset toolOutputs after submition to OpenAI
                ctx.toolOutputs = [];
                // subtask.output = 'Final check...';
                Logger.debug('Final check : Output submitted');
                // add a 2 sec delay
                // await new Promise((resolve) => setTimeout(resolve, 2000));
                // retry
                // subtask.output = 'Checking status...';
                const statusResponse = await ctx.agentManager.checkStatus();
                if (statusResponse?.actions) {
                  ctx.agentResponse.actions = statusResponse.actions;

                  subtask.title = `Running ${ctx.agentResponse.actions?.length ?? 0} additional step(s)`;
                  // const actionTaskList = getActionTaskList(ctx, subtask);
                  // actionTaskList?.add([finalCheck]);
                  // return actionTaskList;
                  const tasks = getActionTaskList(ctx, subtask);
                  if (tasks) {
                    return subtask.newListr(tasks.concat([finalCheck]), {
                      exitOnError: true,
                    });
                    // return TaskManager.indentTask(tasks);
                    // return await TaskManager.runAll()
                    // return task.newListr(tasks, { exitOnError: true });
                  } else {
                    Logger.debug('No tasks found');
                  }
                } else {
                  // subtask.title = 'No additional steps to make.';
                  Logger.debug('No additional steps found');
                }
              } catch (e) {
                Logger.error(e);
                await ctx.agentManager.checkStatus();
                // retry
                // if (status?.actions) {
                //   ctx.agentResponse.actions = status.actions;
                //   await task.run(ctx);
                // }
              }
            } else {
              if (!ctx.toolOutputs) {
                ctx.toolOutputs = [];
              }
              return subtask.newListr(
                getQueryTaskList(
                  {
                    agentId: ctx.agentManager.id,
                    workspace: process.cwd(),
                    skipWarmup: true,
                  },
                  `
          Find below the output of the actions in the task context, if you're done on the main task and its related subtasks, you can stop and wait for my next instructions.
          Output :
          ${ctx.toolOutputs.map((o: { output: string }) => o.output).join('\n')}`
                ),
                {
                  exitOnError: true,
                }
              );
              //     await queryCommand(
              //       `
              // Find below the output of the actions in the task context, if you're done on the main task and its related subtasks, you can stop and wait for my next instructions.
              // Output :
              // ${ctx.toolOutputs.map((o: { output: string }) => o.output).join('\n')}`,
              //       {
              //         agentId: ctx.agentManager.id,
              //         workspace: process.cwd(),
              //         skipWarmup: true,
              //       }
              //     );
            }
          },
        };
        const tasks = getActionTaskList(ctx, task);
        if (tasks) {
          // return TaskManager.indentTask(tasks);
          return task.newListr(tasks.concat([finalCheck]), {
            exitOnError: true,
          });
        }
      },
    },
  ];
}

// Function to execute the query command
export async function queryCommand(
  query: string,
  options: {
    workspace?: string;
    agentId?: string;
    skipWarmup?: boolean;
    callback?: (...args: any[]) => Promise<void>;
    noPersistentAgent?: boolean;
  }
) {
  try {
    await TaskManager.run(getQueryTaskList(options, query), {
      concurrent: false,
      exitOnError: true,
      collectErrors: 'full',
      rendererOptions: {
        indentation: 0,
      },
    });
  } catch (e) {
    Logger.error('Query error:', e);
  }
}
