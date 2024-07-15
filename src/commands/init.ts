import axios from 'axios';
import fs from 'fs';

import { syncWorkspace } from '../utils/workspace';
import { addAgent, readConfig } from '../utils/conf';
import { TaskManager } from '../utils/taskManager';

import { API_HOST, API_VERSION } from '../constants';

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
    const config = await readConfig();

    const taskManager = new TaskManager();
    await taskManager.run('Initializing agent...', async () => {
      const { data: configurations } = await axios.get(`/configurations`, {
        headers: {
          Authorization: `Bearer ${config?.api_key}`,
        },
      });

      const selected_config = configurations.find(
        (config: { key: string; prompt: string }) => config.key === configId
      );
      if (!selected_config) {
        console.error('Invalid configuration ID');
        process.exit(1);
      }
      const workspaceResponse = await syncWorkspace(workspace);
      const { data: agent } = await axios.post(
        '/agents',
        {
          workspace,
          configuration: selected_config.id,
          prompt: selected_config.prompt,
          engine: config?.engine || defaultEngine,
        },
        {
          headers: {
            Authorization: `Bearer ${config?.api_key}`,
          },
        }
      );

      await addAgent({
        id: agent.id,
        name: agent.name,
        workspace,
        configuration: selected_config.id,
        engine: config?.engine || defaultEngine,
      });

      if (
        workspaceResponse &&
        workspaceResponse.data &&
        workspaceResponse.files.length
      ) {
        await axios.post(
          `/files/index?agent=${agent.name}`,
          workspaceResponse.data,
          {
            headers: {
              'Content-Type': 'multipart/form-data',
              Authorization: `Bearer ${config?.api_key}`,
            },
            timeout: 20000,
          }
        );
      }

      console.log(`Agent ${agent.id} created in ${workspace}`);
    });
  } catch (error: any) {
    console.error('An error occurred:', error.message || error);
  }
}
