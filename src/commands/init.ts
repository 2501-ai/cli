import axios from 'axios';
import { syncWorkspace } from '../utils/workspace';
import { addAgent } from '../utils/conf';

axios.defaults.baseURL = 'http://localhost:1337/api/v1';
axios.defaults.timeout = 8000;

interface initCommandOptions {
  name?: string;
  workspace?: string;
  config?: string;
}

// This function will be called when the `init` command is executed
export async function initCommand(options?: initCommandOptions): Promise<void> {
  try {
    const workspace = (options && options.workspace) || process.cwd();
    const configId = (options && options.config) || 'CODING_AGENT';

    const { data: configurations } = await axios.get(`/configurations`);

    const selected_config = configurations.find(
      (config: { id: string; prompt: string }) => config.id === configId
    );
    if (!selected_config) {
      console.error('Invalid configuration ID');
      process.exit(1);
    }
    const workspaceResponse = await syncWorkspace(workspace);
    const { data: agent } = await axios.post('/agents', {
      workspace,
      configuration: selected_config.db_id,
      prompt: selected_config.prompt,
    });

    await addAgent({
      id: agent.db_id,
      name: agent.name,
      workspace,
      configuration: selected_config.id,
      main_engine: agent.main_engine,
      secondary_engine: agent.secondary_engine,
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
          },
          timeout: 20000,
        }
      );
    }
  } catch (error: any) {
    console.error('An error occurred:', error.message);
  }
}
