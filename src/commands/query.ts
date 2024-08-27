import axios from 'axios';
import { marked, MarkedExtension } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { jsonrepair } from 'jsonrepair';
import { convertFormToJSON } from '../utils/json';

import { ListrTask } from 'listr2';
import { TaskManager } from '../managers/taskManager';

import {
  AgentConfig,
  listAgents,
  listAgentsFromWorkspace,
  readConfig,
} from '../utils/conf';
import { API_HOST, API_VERSION } from '../constants';

import { getInitTaskList } from './init';
import { AgentManager } from '../managers/agentManager';
import { Logger } from '../utils/logger';
import {
  getWorkspaceChanges,
  indexWorkspaceFiles,
  syncWorkspaceFiles,
  syncWorkspaceState,
} from '../helpers/workspace';
import { queryAgent, QueryResponseDTO } from '../helpers/api';

marked.use(markedTerminal() as MarkedExtension);

function getEligibleAgents(
  agentId: string | undefined,
  workspace: string
): AgentConfig | null {
  const agents = agentId ? listAgents() : listAgentsFromWorkspace(workspace);
  return agents.find((a) => a.id === agentId) || agents[0] || null;
}

async function synchroniseWorkspaceChanges(agentId: string, workspace: string) {
  const workspaceDiff = await getWorkspaceChanges(workspace);
  if (workspaceDiff.hasChanges) {
    Logger.debug('Agent : Workspace has changes, synchronizing...');
    await syncWorkspaceState(workspace);
    // TODO: improve and send only changed files ?
    const workspaceResponse = await syncWorkspaceFiles(workspace);
    if (workspaceResponse?.data && workspaceResponse?.files.length) {
      await indexWorkspaceFiles(agentId, workspaceResponse.data);
    }
  }
  return workspaceDiff.hasChanges;
}

function getActionTaskList(
  ctx: {
    agentResponse: QueryResponseDTO;
    agentManager: AgentManager;
    changed?: boolean;
    eligible?: AgentConfig | null;
    toolOutputs?: any[];
  },
  task: any
): ListrTask[] {
  if (!ctx.agentResponse.actions) {
    return [];
  }
  return ctx.agentResponse.actions.map((action: any) => {
    let args: any;

    if (action.function.arguments) {
      args = action.function.arguments;
      if (typeof args === 'string') {
        const fixed_args = jsonrepair(args);
        args = JSON.parse(convertFormToJSON(fixed_args));
      }
    } else {
      args = action.args;
    }

    let taskTitle: string = args.answer || args.command || '';
    if (args.url) {
      taskTitle = 'Browsing: ' + args.url;
    }

    return {
      task: async () => {
        try {
          task.title = taskTitle;
          const toolOutput = await ctx.agentManager.executeAction(action, args);
          Logger.debug('Tool output2:', toolOutput);
          if (!ctx.toolOutputs) {
            ctx.toolOutputs = [];
          }
          ctx.toolOutputs.push(toolOutput);
        } catch (e) {
          Logger.error('Action Error :', e);
        }
      },
    };
  });
}

export function getQueryTaskList(
  options: {
    workspace?: string;
    agentId?: string;
    skipWarmup?: boolean;
    callback?: (...args: any[]) => Promise<void>;
    noPersistentAgent?: boolean;
  },
  query: string
): ListrTask<{
  agentResponse: QueryResponseDTO;
  agentManager: AgentManager;
  changed?: boolean;
  eligible?: AgentConfig | null;
  toolOutputs?: any[];
}>[] {
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
          }

          // if (ctx.agentResponse.actions) {
          //   task.title = `Running first ${ctx.agentResponse.actions.length} step(s) ↴`;
          //   return task.newListr(
          //     ctx.agentResponse.actions.map((action: any) => {
          //       let args: any;
          //
          //       if (action.function.arguments) {
          //         args = action.function.arguments;
          //         if (typeof args === 'string') {
          //           const fixed_args = jsonrepair(args);
          //           args = JSON.parse(convertFormToJSON(fixed_args));
          //         }
          //       } else {
          //         args = action.args;
          //       }
          //
          //       let taskTitle: string = args.answer || args.command || '';
          //       if (args.url) {
          //         taskTitle = 'Browsing: ' + args.url;
          //       }
          //
          //       return {
          //         title: taskTitle,
          //         task: async () => {
          //           try {
          //             const toolOutput = await ctx.agentManager.executeAction(
          //               action,
          //               args
          //             );
          //             Logger.debug('Tool output1:', toolOutput);
          //             if (!ctx.toolOutputs) {
          //               ctx.toolOutputs = [];
          //             }
          //             ctx.toolOutputs.push(toolOutput);
          //           } catch (e) {
          //             Logger.error('Action Error :', e);
          //           }
          //         },
          //       };
          //     })
          //   );
          // }

          // return task.newListr(
          //   ctx.agentManager.getProcessActionsTasks(
          //     ctx.agentResponse.actions,
          //     ctx.agentResponse.asynchronous === true
          //   )
          // );
        } catch (e) {
          Logger.error('Query Error :', e);
        }
      },
    },
    {
      task: async (ctx, task) => {
        const tasks = getActionTaskList(ctx, task);

        const finalCheck: ListrTask = {
          task: async (_, subtask) => {
            if (
              ctx.agentManager.engine.includes('rhino') &&
              ctx.agentResponse.asynchronous
            ) {
              subtask.title = `Verifying..`;
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
                await new Promise((resolve) => setTimeout(resolve, 2000));
                // retry
                const statusResponse = await ctx.agentManager.checkStatus();
                if (statusResponse?.actions) {
                  ctx.agentResponse.actions = statusResponse.actions;

                  subtask.title = `Running ${ctx.agentResponse.actions?.length ?? 0} additional step(s)`;
                  return task.newListr(
                    getActionTaskList(ctx, subtask).concat([finalCheck]),
                    {
                      exitOnError: true,
                    }
                  );
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
              await queryCommand(
                `
          Find below the output of the actions in the task context, if you're done on the main task and its related subtasks, you can stop and wait for my next instructions.
          Output :
          ${ctx.toolOutputs.map((o: { output: string }) => o.output).join('\n')}`,
                {
                  agentId: ctx.agentManager.id,
                  workspace: process.cwd(),
                  skipWarmup: true,
                }
              );
            }
          },
        };

        return task.newListr(tasks.concat([finalCheck]), {
          exitOnError: true,
          rendererOptions: {
            collapseSubtasks: true,
          },
        });
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
    });
  } catch (e) {
    Logger.error('Query error:', e);
  }
}
