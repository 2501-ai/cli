import axios from 'axios';
import fs from 'fs';
import { addAgent, readConfig } from '../utils/conf';

import Logger from '../utils/logger';

import { API_HOST, API_VERSION } from '../constants';
import { isDirUnsafe } from '../helpers/security';
import { Configuration } from '../utils/types';
import { createAgent } from '../helpers/api';

axios.defaults.baseURL = `${API_HOST}${API_VERSION}`;
axios.defaults.timeout = 120 * 1000;

export const DEFAULT_ENGINE = 'rhino';

interface InitCommandOptions {
  name?: string;
  workspace?: string | boolean;
  config?: string;
  ignoreUnsafe?: boolean;
}

const logger = new Logger();

async function getConfiguration(configKey: string): Promise<Configuration> {
  const config = readConfig();
  const { data: configurations } = await axios.get<Configuration[]>(
    `/configurations`,
    {
      headers: {
        Authorization: `Bearer ${config?.api_key}`,
      },
    }
  );

  const selectedConfig = configurations.find(
    (config: { key: string; prompt: string }) => config.key === configKey
  );
  if (!selectedConfig) {
    Logger.error(`Configuration not found: ${configKey}`);
    process.exit(1);
  }
  return selectedConfig;
}

async function getWorkspacePath(options?: InitCommandOptions): Promise<string> {
  if (options?.workspace === false) {
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

  if (!options?.ignoreUnsafe && isDirUnsafe(finalPath)) {
    logger.stop(
      `Files in the workspace "${finalPath}" are considered sensitive`
    );
    const res = await logger.prompt(
      `Are you sure you want to continue the synchronization ? (y/n)`
    );
    if (res === false) {
      logger.cancel('Operation cancelled');
      process.exit(0);
    }
    logger.start(`Using workspace at ${finalPath}`);
  } else {
    logger.message(`Using workspace at ${finalPath}`);
  }
  return finalPath;
}

// This function will be called when the `init` command is executed
export async function initCommand(options?: InitCommandOptions) {
  try {
    const configKey = options?.config || 'CODING_AGENT';
    const configuration = await getConfiguration(configKey);
    const workspace = await getWorkspacePath(options);

    logger.start('Creating agent');
    const config = readConfig();

    const createResponse = await createAgent(workspace, configuration);
    Logger.debug('Agent created:', createResponse);
    // Add agent to config.
    addAgent({
      id: createResponse.id,
      name: createResponse.name,
      capabilities: createResponse.capabilities,
      workspace,
      configuration: configuration.id,
      engine: config?.engine || DEFAULT_ENGINE,
    });

    logger.stop(`Agent ${createResponse.id} created`);
  } catch (e: unknown) {
    logger.handleError(e as Error, (e as Error).message);
  }
}
