import axios from 'axios';
import fs from 'fs';

import {
  indexWorkspaceFiles,
  syncWorkspaceFiles,
  syncWorkspaceState,
} from '../helpers/workspace';
import { addAgent, readConfig } from '../utils/conf';
import { TaskManager } from '../managers/taskManager';

import { API_HOST, API_VERSION } from '../constants';
import { Logger } from '../utils/logger';
import { FormData } from 'formdata-node';
import { ListrTask } from 'listr2';

axios.defaults.baseURL = `${API_HOST}${API_VERSION}`;
axios.defaults.timeout = 8000;

export const DEFAULT_ENGINE = 'rhino';

interface initCommandOptions {
  name?: string;
  workspace?: string | boolean;
  config?: string;
}

async function initConfiguration(configId: string) {
  const config = readConfig();
  const { data: configurations } = await axios.get(`/configurations`, {
    headers: {
      Authorization: `Bearer ${config?.api_key}`,
    },
  });

  const selectedConfig = configurations.find(
    (config: { key: string; prompt: string }) => config.key === configId
  );
  if (!selectedConfig) {
    Logger.error('Invalid configuration ID');
    process.exit(1);
  }
  return selectedConfig;
}

async function initAgent(
  workspace: string,
  selected_config: any,
  workspaceResponse: {
    data: FormData | null;
    files: { id: string; name: string }[];
  }
) {
  const config = readConfig();
  const { data: agent } = await axios.post(
    '/agents',
    {
      workspace,
      configuration: selected_config.id,
      prompt: selected_config.prompt,
      engine: config?.engine || DEFAULT_ENGINE,
      files: workspaceResponse.files.map((file) => file.id),
    },
    {
      headers: {
        Authorization: `Bearer ${config?.api_key}`,
      },
    }
  );

  // Add agent to config.
  addAgent({
    id: agent.id,
    name: agent.name,
    workspace,
    configuration: selected_config.id,
    engine: config?.engine || DEFAULT_ENGINE,
  });
  return agent;
}

export function getInitTaskList(
  options: initCommandOptions | undefined
): ListrTask[] {
  const configId = (options && options.config) || 'CODING_AGENT';
  return [
    {
      task: async (ctx, task) => {
        return task.newListr(
          [
            {
              title: 'Creating workspace..',
              task: async (_, task) => {
                return task.newListr(
                  [
                    {
                      task: (_, subtask) => {
                        if (options && options.workspace === false) {
                          const path = `/tmp/2501/${Date.now()}`;
                          fs.mkdirSync(path, { recursive: true });
                          subtask.title = `Using workspace at ${ctx.workspace}`;
                          return path;
                        }
                        const hasCustomWorkspace =
                          options &&
                          typeof options.workspace === 'string' &&
                          !!options.workspace;

                        ctx.workspace = hasCustomWorkspace
                          ? options.workspace
                          : process.cwd();
                        subtask.title = `Using workspace at ${ctx.workspace}`;
                      },
                    },
                    {
                      task: async (_, subtask) => {
                        const workspaceResponse = await syncWorkspaceFiles(
                          ctx.workspace
                        );
                        await syncWorkspaceState(ctx.workspace);
                        ctx.workspaceResponse = workspaceResponse;
                        if (!workspaceResponse.data) {
                          subtask.title = `Workspace is empty`;
                        } else {
                          subtask.title = `Workspace files synchronized`;
                        }
                      },
                    },
                    {
                      task: async (_, subtask) => {
                        if (subtask.task.parent) {
                          subtask.task.parent.title = `Workspace created`;
                        }
                      },
                    },
                  ],
                  { concurrent: false, exitOnError: true }
                );
              },
            },
            {
              title: 'Initializing configuration..',
              task: async (_, subtask) => {
                ctx.selectedConfig = await initConfiguration(configId);
                // if (subtask.task.parent) {
                //   subtask.task.parent.title = `Configuration ${ctx.selectedConfig.id} initialized`;
                // } else {
                subtask.task.title = `Configuration ${ctx.selectedConfig.id} initialized`;
                // }
              },
            },
          ],
          {
            concurrent: true,
            rendererOptions: { collapseSubtasks: true },
            exitOnError: true,
          }
        );
        // .add([
        //   {
        //     task: async (_, task) => {
        //       task.task.parent!.title = `Initialization complete`;
        //     },
        //   },
        // ]);
      },
    },
    {
      title: 'Creating agent..',
      task: async (ctx, task) => {
        ctx.agent = await initAgent(
          ctx.workspace,
          ctx.selectedConfig,
          ctx.workspaceResponse
        );
        task.title = `Agent ${ctx.agent.id} created`;
      },
    },
    {
      title: 'Indexing workspace files..',
      retry: 3,
      task: async (ctx, task) => {
        Logger.debug('Context:', ctx);
        if (!ctx.workspaceResponse.data) {
          task.title = `Nothing to index`;
          return;
        }
        await indexWorkspaceFiles(
          ctx.agent.id,
          ctx.workspaceResponse.data,
          ctx.workspaceResponse.files
        );
        task.title = `Workspace files indexed`;
      },
    },
    {
      task: async (_, task) => {
        if (task.task.parent) {
          task.task.parent.title = `Initialization complete`;
        } else {
          task.title = `Initialization complete`;
        }
      },
    },
  ];
}

// This function will be called when the `init` command is executed
export async function initCommand(options?: initCommandOptions) {
  try {
    await TaskManager.run(getInitTaskList(options), {
      concurrent: false,
      exitOnError: true,
      collectErrors: 'full',
    });
  } catch (e) {
    Logger.error('Initialization error:', e);
  }
}
