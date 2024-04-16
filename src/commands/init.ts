import axios from 'axios';
import { terminal as term } from 'terminal-kit';
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
export async function initCommand(options: initCommandOptions): Promise<void> {
  try {
    const workspace = options.workspace || process.cwd();
    const configId = options.config || 'CODING_AGENT';

    const progressBar = term.progressBar({
      title: 'Initializing agent...',
      width: 80,
      syncMode: true,
      percent: true,
      items: 4
    })

    progressBar.startItem('Fetching configurations...')
    const { data: configurations } = await axios.get(`/configurations`);

    const selected_config = configurations.find(
      (config: { id: string; prompt: string }) => config.id === configId
    );
    if (!selected_config) {
      console.error('Invalid configuration ID');
      process.exit(1);
    }
    progressBar.itemDone('Fetching configurations...')

    progressBar.startItem('Syncing workspace...')
    const workspaceResponse = await syncWorkspace(workspace);
    progressBar.itemDone('Syncing workspace...')

    progressBar.startItem('Creating agent...')
    const { data: agent } = await axios.post('/agents', {
      workspace,
      configuration: selected_config.db_id,
      prompt: selected_config.prompt,
    });
    progressBar.itemDone('Creating agent...')

    progressBar.startItem('Adding agent to local configuration...')
    await addAgent({ id: agent.name, workspace, configuration: selected_config.id });
    progressBar.itemDone('Adding agent to local configuration...')

    if (
      workspaceResponse &&
      workspaceResponse.data &&
      workspaceResponse.files.length
    ) {
      console.log('Indexing workspace files...');
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

    term('\n')
    console.log('Initialization complete.');
    progressBar.stop()
  } catch (error: any) {
    console.error('An error occurred:', error.message);
  }
}