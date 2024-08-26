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

axios.defaults.baseURL = `${API_HOST}${API_VERSION}`;
axios.defaults.timeout = 8000;

export const DEFAULT_ENGINE = 'rhino';

interface initCommandOptions {
  name?: string;
  workspace?: string | boolean;
  config?: string;
}

function getWorkspace(options?: initCommandOptions): string {
  if (options && options.workspace === false) {
    const path = `/tmp/2501/${Date.now()}`;
    fs.mkdirSync(path, { recursive: true });
    return path;
  }

  return (
    (options && typeof options.workspace === 'string' && options.workspace) ||
    process.cwd()
  );
}

// This function will be called when the `init` command is executed
export async function initCommand(options?: initCommandOptions): Promise<void> {
  try {
    const workspace = getWorkspace(options);
    const configId = (options && options.config) || 'CODING_AGENT';
    const config = readConfig();

    const taskManager = new TaskManager();
    await taskManager.run('Initializing agent...', async () => {
      try {
        const { data: configurations } = await axios.get(`/configurations`, {
          headers: {
            Authorization: `Bearer ${config?.api_key}`,
          },
        });

        const selected_config = configurations.find(
          (config: { key: string; prompt: string }) => config.key === configId
        );
        if (!selected_config) {
          Logger.error('Invalid configuration ID');
          process.exit(1);
        }

        const workspaceResponse = await syncWorkspaceFiles(workspace);
        await syncWorkspaceState(workspace);

        const { data: agent } = await axios.post(
          '/agents',
          {
            workspace,
            configuration: selected_config.id,
            prompt: selected_config.prompt,
            engine: config?.engine || DEFAULT_ENGINE,
            files: workspaceResponse?.files.map((file) => file.id),
          },
          {
            headers: {
              Authorization: `Bearer ${config?.api_key}`,
            },
          }
        );

        addAgent({
          id: agent.id,
          name: agent.name,
          workspace,
          configuration: selected_config.id,
          engine: config?.engine || DEFAULT_ENGINE,
        });

        if (workspaceResponse?.data && workspaceResponse?.files.length) {
          await indexWorkspaceFiles(
            agent.id,
            workspaceResponse.data,
            workspaceResponse.files
          );
        }

        Logger.log(`Agent ${agent.id} created in ${workspace}`);
      } catch (error) {
        Logger.error('Task error :', (error as Error)?.message || error);
        throw error;
      }
    });
  } catch (error) {
    Logger.error('An error occurred:', (error as Error)?.message || error);
  }
}
