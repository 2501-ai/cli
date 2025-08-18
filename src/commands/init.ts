import axios from 'axios';
import fs from 'fs';

// Local imports
import {
  createAgent,
  getAgent,
  updateAgent,
  updateHostInfo,
} from '../helpers/api';
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
import { getHostInfo, getSystemInfo } from '../utils/systemInfo';
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
  agentId?: string;
}

const logger = new Logger();

async function fetchConfiguration(configKey: string): Promise<Configuration> {
  const { data: configurations } =
    await axios.get<Configuration[]>(`/configurations`);

  const selectedConfig = configurations.find(
    (config: { key: string; prompt: string }) => config.key === configKey
  );

  if (!selectedConfig) {
    throw new Error(`Configuration not found: ${configKey}`);
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
): Promise<RemoteExecConfig | void> {
  if (!options?.remoteExec) {
    return;
  }

  const remoteExecConfig = await configureAndValidateRemoteExecution(options);
  if (!remoteExecConfig) {
    return;
  }

  await detectPlatformAndAdjustWorkspace(remoteExecConfig, options, logger);
  return remoteExecConfig;
}

/**
 * Exit if a remote execution agent already exists.
 */
function checkForExistingAgent(workspacePath: string) {
  const eligibleAgent = getEligibleAgent(workspacePath);
  if (eligibleAgent?.remote_exec?.enabled) {
    throw new Error('An agent is already initialized in this workspace.');
  }
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
    checkForExistingAgent(workspacePath);

    const systemInfoPromise = remoteExecConfig
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
    const path = remoteExecConfig?.remote_workspace ?? workspacePath;

    //TODO: add support for options.agentId and retrieve the existing agent if it exists.
    let id: string;
    let name: string;
    const hostInfo = await getHostInfo();

    if (options.agentId) {
      const agent = await getAgent(options.agentId);
      id = agent.id;
      name = agent.name;
      Logger.debug('Agent retrieved:', { agent });
      // TODO: add status check for the agent with new statuses ?
      if (agent.status !== 'idle') {
        logger.cancel(
          `Agent ${id} is not idle. Please stop the agent before starting a new task.`
        );
        throw new Error('Agent is not idle.');
      }

      // @NOTE : decide if we need to keep this workaround for non-swarm
      delete hostInfo.public_ip;
      delete hostInfo.public_ip_note;
      await updateHostInfo(id, hostInfo);

      // Update the system info for the agent.
      await updateAgent(id, {
        workspace: path,
        cli_data: {
          systemInfo,
        },
      });
    } else {
      const createdAgent = await createAgent(
        path,
        agentConfig,
        systemInfo,
        configManager.get('engine'),
        hostInfo
      );
      Logger.debug('Agent created:', { agent: createdAgent });
      id = createdAgent.id;
      name = createdAgent.name;
    }

    // Add agent to local config.
    addAgent({
      id,
      name,
      workspace: workspacePath,
      configuration: agentConfig.id,
      engine: configManager.get('engine'),
      remote_exec: remoteExecConfig ?? undefined,
    });

    TelemetryManager.instance.updateContext({
      agentId: id,
    });
    logger.stop(`Agent ${id} ${options.agentId ? 'retrieved' : 'created'}`);
  } catch (error) {
    logger.stop('Failed to initialize agent', 1);
    throw error;
  }
};
