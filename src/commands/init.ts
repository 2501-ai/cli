import axios from 'axios';
import fs from 'fs';
import { terminal } from 'terminal-kit';
import os from 'os';

// Local imports
import Logger from '../utils/logger';
import { addAgent, readConfig, setValue } from '../utils/conf';
import { API_HOST, API_VERSION } from '../constants';
import { isDirUnsafe } from '../helpers/security';
import { Configuration } from '../utils/types';
import { createAgent } from '../helpers/api';
import { DISCORD_LINK } from '../utils/messaging';

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
    logger.log(`Using workspace at ${path}`);
    return path;
  }

  let finalPath;
  if (typeof options?.workspace === 'string' && !!options.workspace) {
    finalPath = options.workspace;
  } else {
    finalPath = process.cwd();
  }

  if (!options?.ignoreUnsafe && isDirUnsafe(finalPath)) {
    logger.log(
      `Files in the workspace "${finalPath}" are considered sensitive`
    );
    const res = await logger.prompt(
      `Are you sure you want to proceed with synchronization ? This will synchronize a sensitive directory and may overwrite or modify critical files. (y/n)`
    );

    // The symbol handles the CTRL+C cancelation from user.
    if (res === false || res.toString() === 'Symbol(clack:cancel)') {
      logger.cancel('Operation cancelled');
      process.exit(0);
    }

    logger.log(`Using workspace at ${finalPath}`);
  }
  return finalPath;
}

/**
 * Collect system and CLI metrics, while respecting user privacy.
 */
function collectmetrics() {
  const sysInfo = {
    cores: os.cpus().length,
    mem: os.totalmem() / 1024 / 1024,
    platform: os.platform(),
    type: os.type(),
    release: os.release(),
    arch: os.arch(),
    hostname: os.hostname(),
  };

  const nodeInfo = {
    version: process.version,
    config: process.config,
    // Collect packages installed globally
    packages: [],
  };
  return {
    sysInfo,
    nodeInfo,
  }
}

// This function will be called when the `init` command is executed
export async function initCommand(options?: InitCommandOptions) {
  try {
    const workspace = await getWorkspacePath(options);
    const config = readConfig();
    const metrics = collectmetrics();;

    if (!config?.join_discord_shown) {
      const term = terminal;

      term('\n');
      term.gray('🔗 Join our Discord\n');
      term
        .gray('│ ')
        .gray(
          'Connect with the 2501 team and community for updates, support, and insights:\n'
        );
      term.gray('│ ').gray.underline(`${DISCORD_LINK}\n`);

      setValue('join_discord_shown', true);
    }

    logger.start('Creating agent');
    const configKey = options?.config || 'CODING_AGENT';
    const configuration = await getConfiguration(configKey);

    const createResponse = await createAgent(
      workspace,
      configuration,
      config?.engine
    );
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
