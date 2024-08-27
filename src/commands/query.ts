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

export function getQueryTaskList(
  options: {
    workspace?: string;
    agentId?: string;
    skipWarmup?: boolean;
    callback?: (...args: any[]) => Promise<void>;
    noPersistentAgent?: boolean;
  },
  query: string
): ListrTask[] {
  const config = readConfig();
  const workspace = options.workspace || process.cwd();
  const agentId = options.agentId;
  const skipWarmup = options.skipWarmup;

  return [
    {
      title: 'Syncing...',
      task: async (ctx, subtask) => {
        ctx.eligible = getEligibleAgents(agentId, workspace);
        // initialize agent if not found
        if (!ctx.eligible && !skipWarmup) {
          return subtask.newListr(getInitTaskList({ workspace }));
        }
      },
    },
    {
      task: async (ctx, subtask) => {
        ctx.eligible = getEligibleAgents(agentId, workspace);

        subtask.title = `Using agent: (${ctx.eligible.id})`;

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
        subtask.title = ctx.changed
          ? `Workspace synchronised`
          : `Workspace up to date`;
      },
    },
    {
      task: async (ctx, task) => {
        task.title = 'Thinking...';
        try {
          Logger.debug('Querying agent..', ctx.agentManager.id);
          const { data } = await axios.post(
            `${API_HOST}${API_VERSION}/agents/${ctx.agentManager.id}/query`,
            { query, changed: ctx.changed },
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config?.api_key}`,
              },
              timeout: 5 * 60 * 1000,
            }
          );
          ctx.agentResponse = data;

          if (
            ctx.agentResponse.asynchronous &&
            ctx.agentResponse.asynchronous === true
          ) {
            const { actions } = await ctx.agentManager.checkStatus();
            if (actions) {
              ctx.agentResponse.actions = actions;
            }
          }

          if (ctx.agentResponse.response) {
            Logger.agent(ctx.agentResponse.response);
          }

          ctx.toolOutputs = [];
          if (ctx.agentResponse.actions) {
            task.title = `Running ${ctx.agentResponse.actions.length} step(s) ↴`;
            return task.newListr(
              ctx.agentResponse.actions.map((a: any) => {
                let args: any;

                if (a.function.arguments) {
                  args = a.function.arguments;
                  if (typeof args === 'string') {
                    const fixed_args = jsonrepair(args);
                    args = JSON.parse(convertFormToJSON(fixed_args));
                  }
                } else {
                  args = a.args;
                }

                let taskTitle: string = args.answer || args.command || '';
                if (args.url) {
                  taskTitle = 'Browsing: ' + args.url;
                }

                return {
                  title: taskTitle,
                  task: async () => {
                    try {
                      const toolOutput = await ctx.agentManager.executeAction(
                        a,
                        args
                      );
                      ctx.toolOutputs.push(...toolOutput);
                    } catch (e) {
                      Logger.error('Action Error :', e);
                    }
                  },
                };
              })
            );
          }

          // return task.newListr(
          //   ctx.agentManager.getProcessActionsTasks(
          //     ctx.agentResponse.actions,
          //     ctx.agentResponse.asynchronous === true
          //   )
          // );
        } catch (e) {
          console.error(e);
          // Logger.error('Query Error :', e);
        }
      },
    },
    {
      task: async (ctx, task) => {
        return task.newListr(
          [
            {
              title: 'Final check...',
              task: async () => {
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
                    // add a 2 sec delay
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                    await ctx.agentManager.checkStatus();
                  } catch (e) {
                    await ctx.agentManager.checkStatus();
                  }
                } else {
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
            },
          ],
          {
            exitOnError: true,
          }
        );
      },
    },
    // {
    //   task: async (ctx, task) => {
    //     return task.newListr(
    //       [
    //         {
    //           title: 'Resync workspace..',
    //           task: async () => {
    //             await synchroniseWorkspaceChanges(
    //               ctx.agentManager.id,
    //               workspace
    //             );
    //           },
    //         },
    //       ],
    //       {
    //         exitOnError: true,
    //       }
    //     );
    //   },
    // },
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
      exitOnError: false,
      collectErrors: 'full',
    });
  } catch (e) {
    Logger.error('Query error:', e);
  }
}
