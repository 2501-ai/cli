import axios from 'axios';
import fs from 'fs';

import {
  indexWorkspaceFiles,
  syncWorkspaceFiles,
  syncWorkspaceState,
} from '../utils/workspace';
import { addAgent, readConfig } from '../utils/conf';
import { TaskManager } from '../utils/taskManager';

import { API_HOST, API_VERSION } from '../constants';
import { Logger } from '../utils/logger';
import { createAgent, getConfigurations } from '../api';
import { measurePerformance } from '../utils/performance';

axios.defaults.baseURL = `${API_HOST}${API_VERSION}`;
axios.defaults.timeout = 8000;

const defaultEngine = 'rhino';

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
        const configurations = await measurePerformance(getConfigurations)();

        const selected_config = configurations.find(
          (config: { key: string; prompt: string }) => config.key === configId
        );
        if (!selected_config) {
          Logger.error('Invalid configuration ID');
          process.exit(1);
        }

        const workspaceResponse = await syncWorkspaceFiles(workspace);
        await syncWorkspaceState(workspace);

        const agent = await measurePerformance(createAgent)(
          workspace,
          selected_config.id,
          selected_config.prompt,
          config?.engine || defaultEngine,
          workspaceResponse?.files.map((file) => file.id) || []
        );

        addAgent({
          id: agent.id,
          name: agent.name,
          workspace,
          configuration: selected_config.id,
          engine: config?.engine || defaultEngine,
        });

        if (workspaceResponse?.data && workspaceResponse?.files.length) {
          await measurePerformance(indexWorkspaceFiles)(
            agent.name,
            workspaceResponse.data
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
