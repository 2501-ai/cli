import axios from 'axios';
import fs from 'fs';
import { terminal } from 'terminal-kit';

// Local imports
import { createAgent } from '../helpers/api';
import { isDirUnsafe } from '../helpers/security';
import { resolveWorkspacePath } from '../helpers/workspace';
import { ConfigManager } from '../managers/configManager';
import { TelemetryManager } from '../managers/telemetryManager';
import {
  configureAndValidateRemoteExecution,
  detectPlatformAndAdjustWorkspace,
} from '../remoteExecution/connectionParser';
import { RemoteExecutor } from '../remoteExecution/remoteExecutor';
import { getRemoteSystemInfo } from '../remoteExecution/remoteSystemInfo';
import { addAgent, getEligibleAgent } from '../utils/conf';
import Logger from '../utils/logger';
import { getTempPath2501 } from '../utils/platform';
import { getSystemInfo } from '../utils/systemInfo';
import { Configuration, RemoteExecConfig } from '../utils/types';

export interface InitCommandOptions {
  name?: string;
  workspace?: string | boolean;
  config?: string;
  ignoreUnsafe?: boolean;
  remoteExec?: string;
  remotePrivateKey?: string;
  remoteWorkspace?: string;
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
  if (RemoteExecutor.instance.isEnabled()) {
    return resolveWorkspacePath({
      workspace:
        typeof options.workspace === 'string' ? options.workspace : undefined,
    });
  }

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

/**
 * Initialize the remote execution.
 *
 * 1. Validate the connection string.
 * 2. Initialize the remote execution.
 * 3. Connect and detect the platform.
 * 4. Adjust the workspace path based on the platform.
 */
export async function initRemoteExecution(
  options: InitCommandOptions,
  logger: Logger
): Promise<RemoteExecConfig | undefined> {
  if (!options?.remoteExec) {
    return;
  }

  const remoteExecConfig = await configureAndValidateRemoteExecution(
    options,
    logger
  );
  if (!remoteExecConfig) {
    return;
  }

  await detectPlatformAndAdjustWorkspace(remoteExecConfig, options, logger);
  return remoteExecConfig;
}

// This function will be called when the `init` command is executed
export const initCommand = async (
  options: InitCommandOptions
): Promise<void> => {
  try {
    const configManager = ConfigManager.instance;

    if (process.env.TFZO_DISABLE_SPINNER) {
      const shouldDisableSpinner = process.env.TFZO_DISABLE_SPINNER === 'true';
      configManager.set('disable_spinner', shouldDisableSpinner);
    }

    const workspacePath = await getWorkspacePath(options);

    const remoteExecConfig = await initRemoteExecution(options, logger);
    const eligibleAgent = getEligibleAgent(workspacePath);
    if (eligibleAgent?.remote_exec?.enabled) {
      logger.cancel(
        'An agent is already initialized in this workspace. Remote execution cancelled.'
      );
      process.exit(1);
    }

    const systemInfoPromise = RemoteExecutor.instance.isEnabled()
      ? getRemoteSystemInfo()
      : getSystemInfo();

    const configKey = options.config || 'SYSOPS';
    const parallelPromises = [
      systemInfoPromise,
      fetchConfiguration(configKey),
    ] as const;

    const [systemInfo, agentConfig] = await Promise.all(parallelPromises);

    TelemetryManager.instance.updateContext({
      workspacePath: workspacePath,
    });

    Logger.debug('systemInfo results:', { systemInfo });

    logger.start('Creating agent');
    // Give the agent a workspace that is the remote workspace if remote execution is enabled.
    const path = remoteExecConfig?.enabled
      ? remoteExecConfig.remote_workspace
      : workspacePath;

    const { id, name } = await createAgent(
      path,
      agentConfig,
      systemInfo,
      configManager.get('engine')
    );
    Logger.debug('Agent created:', { id, name });

    // Add agent to config.
    addAgent({
      id,
      name,
      workspace: workspacePath,
      configuration: agentConfig.id,
      engine: configManager.get('engine'),
      remote_exec: remoteExecConfig,
    });

    TelemetryManager.instance.updateContext({
      agentId: id,
    });
    logger.stop(`Agent ${id} created`);
  } catch (e: unknown) {
    logger.handleError(e as Error, (e as Error).message);
  }
};
