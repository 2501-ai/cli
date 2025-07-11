import axios from 'axios';
import fs from 'fs';
import { terminal } from 'terminal-kit';

// Local imports
import { API_HOST, API_VERSION } from '../constants';
import { createAgent } from '../helpers/api';
import { isDirUnsafe } from '../helpers/security';
import { resolveWorkspacePath } from '../helpers/workspace';
import { ConfigManager } from '../managers/configManager';
import { TelemetryManager } from '../managers/telemetryManager';
import { configureRemoteExecution } from '../remoteExecution/config';
import { RemoteExecutor } from '../remoteExecution/remoteExecutor';
import { addAgent } from '../utils/conf';
import Logger from '../utils/logger';
import { DISCORD_LINK } from '../utils/messaging';
import { getTempPath2501 } from '../utils/platform';
import { getSystemInfo } from '../utils/systemInfo';
import { Configuration } from '../utils/types';

axios.defaults.baseURL = `${API_HOST}${API_VERSION}`;
axios.defaults.timeout = 120 * 1000;

interface InitCommandOptions {
  name?: string;
  workspace?: string | boolean;
  config?: string;
  ignoreUnsafe?: boolean;
  remoteExec?: string;
  remoteExecType?: string;
  remoteExecPassword?: string;
}

const logger = new Logger();

async function fetchConfiguration(configKey: string): Promise<Configuration> {
  const { data: configurations } =
    await axios.get<Configuration[]>(`/configurations`);

  const selectedConfig = configurations.find(
    (config: { key: string; prompt: string }) => config.key === configKey
  );

  if (!selectedConfig) {
    Logger.error(`Configuration not found: ${configKey}`);
    process.exit(1);
  }
  return selectedConfig;
}

export async function getWorkspacePath(
  options: InitCommandOptions
): Promise<string> {
  // For now, we'll handle remote workspace resolution in the actions
  // when they have access to the agent configuration

  if (options.workspace === false) {
    const path = getTempPath2501(Date.now().toString());
    fs.mkdirSync(path, { recursive: true });
    logger.log(`Using workspace at ${path}`);
    return path;
  }

  let finalPath;
  if (typeof options.workspace === 'string' && !!options.workspace) {
    // Convert relative path to absolute path if necessary
    finalPath = resolveWorkspacePath({ workspace: options.workspace });
  } else {
    finalPath = process.cwd();
  }

  if (!options.ignoreUnsafe && isDirUnsafe(finalPath)) {
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

// This function will be called when the `init` command is executed
export const initCommand = async (
  options: InitCommandOptions
): Promise<void> => {
  try {
    const configManager = ConfigManager.instance;

    if (!configManager.get('join_discord_shown')) {
      const term = terminal;

      term('\n');
      term.gray('🔗 Join our Discord\n');
      term
        .gray('│ ')
        .gray(
          'Connect with the 2501 team and community for updates, support, and insights:\n'
        );
      term.gray('│ ').gray.underline(`${DISCORD_LINK}\n`);

      configManager.set('join_discord_shown', true);
    }

    if (process.env.TFZO_DISABLE_SPINNER) {
      const shouldDisableSpinner = process.env.TFZO_DISABLE_SPINNER === 'true';
      configManager.set('disable_spinner', shouldDisableSpinner);
    }

    logger.start('Creating agent');
    const configKey = options.config || 'SYSOPS';

    const systemInfoPromise = getSystemInfo();

    const parallelPromises = [
      getWorkspacePath(options),
      systemInfoPromise,
      fetchConfiguration(configKey),
    ] as const;

    const [workspacePath, systemInfo, agentConfig] =
      await Promise.all(parallelPromises);

    TelemetryManager.instance.updateContext({
      workspacePath: workspacePath,
    });

    Logger.debug('systemInfo results:', { systemInfo });

    const createResponse = await createAgent(
      workspacePath,
      agentConfig,
      systemInfo,
      configManager.get('engine')
    );
    Logger.debug('Agent created:', createResponse);

    // Configure remote execution if specified
    const remoteExecConfig = configureRemoteExecution(options);

    // Validate remote connection if configured
    if (remoteExecConfig?.enabled) {
      logger.start('Testing remote connection...');

      RemoteExecutor.instance.init({
        ...createResponse,
        remote_exec: remoteExecConfig,
      });

      try {
        const isValid = await RemoteExecutor.instance.validateConnection();

        if (!isValid) {
          logger.cancel(
            'Remote connection validation failed. Please check your settings.'
          );
          process.exit(1);
        }

        logger.stop('Remote connection validated successfully');
      } catch (error) {
        logger.cancel(
          `Remote connection validation failed: ${(error as Error).message}`
        );
        process.exit(1);
      }
    }

    // Add agent to config.
    addAgent({
      id: createResponse.id,
      name: createResponse.name,
      workspace: workspacePath,
      configuration: agentConfig.id,
      engine: configManager.get('engine'),
      remote_exec: remoteExecConfig,
    });

    TelemetryManager.instance.updateContext({
      agentId: createResponse.id,
    });
    logger.stop(`Agent ${createResponse.id} created`);
  } catch (e: unknown) {
    logger.handleError(e as Error, (e as Error).message);
  }
};
