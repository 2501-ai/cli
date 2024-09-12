import axios from 'axios';
import fs from 'fs';
import { FormData } from 'formdata-node';

import { syncWorkspaceFiles, indexWorkspaceFiles } from '../helpers/workspace';
import { addAgent, readConfig } from '../utils/conf';

import Logger from '../utils/logger';

import { API_HOST, API_VERSION } from '../constants';

axios.defaults.baseURL = `${API_HOST}${API_VERSION}`;
axios.defaults.timeout = 120 * 1000;

export const DEFAULT_ENGINE = 'rhino';

interface InitCommandOptions {
  name?: string;
  workspace?: string | boolean;
  config?: string;
}

const logger = new Logger();

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
    files: { path: string; data: Buffer }[];
    vectorStoredFiles: { id: string; name: string }[];
  }
) {
  const config = readConfig();
  const { data: createResponse } = await axios.post(
    '/agents',
    {
      workspace,
      configuration: selected_config.id,
      prompt: selected_config.prompt,
      engine: config?.engine || DEFAULT_ENGINE,
      files: workspaceResponse.vectorStoredFiles.map((file) => file.id),
    },
    {
      headers: {
        Authorization: `Bearer ${config?.api_key}`,
      },
    }
  );
  Logger.debug('Agent created:', createResponse);

  // Add agent to config.
  addAgent({
    id: createResponse.id,
    name: createResponse.name,
    capabilities: createResponse.capabilities,
    workspace,
    configuration: selected_config.id,
    engine: config?.engine || DEFAULT_ENGINE,
  });
  return createResponse;
}

async function createWorkspace(options?: InitCommandOptions): Promise<string> {
  if (options && options.workspace === false) {
    const path = `/tmp/2501/${Date.now()}`;
    fs.mkdirSync(path, { recursive: true });
    logger.message(`Using workspace at ${path}`);
    return path;
  }

  let finalPath;
  if (typeof options?.workspace === 'string' && !!options.workspace) {
    finalPath = options.workspace;
  } else {
    finalPath = process.cwd();
  }

  logger.message(`Using workspace at ${finalPath}`);
  return finalPath;
}

export type InitTaskContext = {
  workspace: string;
  workspaceResponse: {
    data: FormData | null;
    files: { id: string; name: string }[];
  };
  selectedConfig: any;
  agent: any;
};

// This function will be called when the `init` command is executed
export async function initCommand(options?: InitCommandOptions) {
  try {
    logger.intro('>>> Initializing Agent');

    logger.start('Synchronizing workspace');
    const configId = options?.config || 'CODING_AGENT';
    const workspacePath = await createWorkspace(options);
    const workspaceResponse = await syncWorkspaceFiles(workspacePath);
    const selectedConfig = await initConfiguration(configId);
    logger.stop('Workspace created');

    logger.start('Creating agent');
    const agent = await initAgent(
      workspacePath,
      selectedConfig,
      workspaceResponse
    );
    await indexWorkspaceFiles(
      agent.id,
      workspaceResponse.files,
      workspaceResponse.vectorStoredFiles
    );

    logger.stop(`Agent ${agent.id} created`);
  } catch (e) {
    Logger.error('Initialization error:', e);
    logger.cancel('Initialization failed');
  }
}
