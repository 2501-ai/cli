import axios from 'axios';
import { marked, MarkedExtension } from 'marked';
import { markedTerminal } from 'marked-terminal';

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
import { ListrTask } from 'listr2';

marked.use(markedTerminal() as MarkedExtension);

function getElligibleAgents(
  agentId: string | undefined,
  workspace: string
): AgentConfig | null {
  const agents = agentId ? listAgents() : listAgentsFromWorkspace(workspace);
  return agents.find((a) => a.id === agentId) || agents[0] || null;
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
      title: 'Warming up...',
      task: async (ctx, task) => {
        return task.newListr([
          {
            title: 'Retrieving agents..',
            task: async (_, subtask) => {
              ctx.eligible = getElligibleAgents(agentId, workspace);
              // initialize agent if not found
              if (!ctx.eligible && !skipWarmup) {
                return subtask.newListr(getInitTaskList({ workspace }));
              }
            },
          },
          {
            title: 'Verifying..',
            task: async (_, subtask) => {
              ctx.eligible = getElligibleAgents(agentId, workspace);
              if (!ctx.eligible) {
                throw new Error('No eligible agents found');
              }
              subtask.title = `Using agent: (${ctx.eligible.id})`;
            },
          },
          {
            title: 'Reviewing workspace changes..',
            retry: 3,
            task: async (_, subtask) => {
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
                agentManager.name,
                workspace
              );
              subtask.title = ctx.changed
                ? `Workspace synchronised`
                : `Workspace up to date`;
            },
          },
        ]);
      },
    },
    {
      task: async (ctx, task) => {
        task.title = 'Thinking..';
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
      },
    },
    {
      task: async (ctx, task) => {
        return task.newListr([
          {
            title: 'Processing..',
            task: async () => {
              try {
                if (
                  ctx.agentResponse.asynchronous &&
                  ctx.agentResponse.asynchronous === true
                ) {
                  task.title = 'Waiting for update..';
                  return ctx.agentManager.checkStatus();
                }

                if (ctx.agentResponse.response) {
                  Logger.agent(ctx.agentResponse.response);
                }

                task.title = 'Processing actions..';
                if (ctx.agentResponse.actions) {
                  await ctx.agentManager.processActions(
                    ctx.agentResponse.actions,
                    ctx.agentResponse.asynchronous === true
                  );
                }
                task.title = 'Done';
              } catch (e) {
                Logger.error('Query Error :', e);
              }
            },
          },
          {
            title: 'Synchronizing workspace..',
            task: async () => {
              await synchroniseWorkspaceChanges(
                ctx.agentManager.name,
                workspace
              );
            },
          },
        ]);
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
      exitOnError: false,
      collectErrors: 'full',
    });
  } catch (e) {
    Logger.error('Query error:', e);
  }
}

async function synchroniseWorkspaceChanges(
  agentName: string,
  workspace: string
) {
  const workspaceDiff = await getWorkspaceChanges(workspace);
  if (workspaceDiff.hasChanges) {
    Logger.debug('Agent : Workspace has changes, synchronizing...');
    await syncWorkspaceState(workspace);
    // TODO: improve and send only changed files ?
    const workspaceResponse = await syncWorkspaceFiles(workspace);
    if (workspaceResponse?.data && workspaceResponse?.files.length) {
      await indexWorkspaceFiles(agentName, workspaceResponse.data);
    }
  }
  return workspaceDiff.hasChanges;
}
