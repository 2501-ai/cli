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
import { updateTelemetryContext } from '../telemetry/contextBuilder';
import { configureRemoteExecution } from '../remoteExecution/connectionParser';
import { setupRemoteWorkspace } from '../remoteExecution/remoteWorkspace';
import { RemoteExecutor } from '../remoteExecution/remoteExecutor';
import { getRemoteSystemInfo } from '../remoteExecution/remoteSystemInfo';
import { addAgent, getEligibleAgent } from '../utils/conf';
import Logger from '../utils/logger';
import { getTempPath2501 } from '../utils/platform';
import { getHostInfo, getSystemInfo } from '../utils/systemInfo';
import { Configuration, RemoteExecConfig } from '../utils/types';
import { TelemetryContext } from '../telemetry';

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
  rawSsh?: boolean;
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
 * 1. Configure the remote execution.
 * 2. Validate the connection.
 * 3. Initialize the remote execution.
 * 4. Validate the connection (and detect the platform through the connection).
 * 5. Adjust the workspace path based on the platform.
 */
export async function initRemoteExecution(
  options: InitCommandOptions,
  logger: Logger
): Promise<RemoteExecConfig | void> {
  if (!options?.remoteExec) {
    return;
  }

  let remoteExecConfig: RemoteExecConfig;

  try {
    remoteExecConfig = configureRemoteExecution(options);
  } catch (error) {
    throw new Error(
      `Remote connection configuration failed: ${(error as Error).message}`
    );
  }

  // Initialize executor to run the detection command
  RemoteExecutor.instance.init(remoteExecConfig);

  // Validate the connection and detect the platform.
  const { target, type } = remoteExecConfig;
  logger.start(`Connecting to remote host ${target} using ${type}...`);

  const isValid = await RemoteExecutor.instance.validateConnection();
  if (!isValid) {
    throw new Error('Remote connection failed. Please check your settings.');
  }
  const { platform } = RemoteExecutor.instance.getConfig();
  logger.message(`Detected platform: ${platform} for ${target}`);
  logger.stop('Remote connection validated successfully');

  // Initialize the remote workspace.
  const remoteWorkspace = await setupRemoteWorkspace(remoteExecConfig, options);
  remoteExecConfig.remote_workspace = remoteWorkspace;

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
    updateTelemetryContext({ agentId: options.agentId });
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

    const systemInfo = await systemInfoPromise;

    Logger.debug('systemInfo results:', systemInfo);
    logger.start('Creating agent');

    // Give the agent a workspace that is the remote workspace if remote execution is enabled.
    const path = remoteExecConfig?.remote_workspace ?? workspacePath;

    let id: string;
    let name: string;
    let configurationKey = options.config || '';

    const hostInfo = await getHostInfo();
    const context: TelemetryContext = {
      agentId: options.agentId,
    };

    if (options.agentId) {
      const agent = await getAgent(options.agentId);
      id = agent.id;
      name = agent.name;
      Logger.debug('Agent retrieved:', { agent });

      if (agent.status !== 'idle') {
        const msg = `Agent ${id} is not idle. Please stop the agent before starting a new task.`;
        logger.cancel(msg);
        Logger.debug(msg);
        throw new Error('Agent is not idle.');
      }

      configurationKey = agent.configuration;
      if (RemoteExecutor.instance.isEnabled()) {
        // hack to avoid ips to be overriden on remote-exec usages
        delete hostInfo.public_ip;
        delete hostInfo.public_ip_note;
        delete hostInfo.private_ip;
        delete hostInfo.name;
      }

      await updateHostInfo(id, hostInfo);

      // Update the system info for the agent.
      await updateAgent(id, {
        workspace: path,
        cli_data: {
          ...systemInfo,
        },
      });
      context.orgId = agent.organization.id;
      context.tenantId = agent.organization.tenant_id;
      context.agentId = agent.id;
    } else {
      if (!options.config) {
        throw new Error('A configuration Key is required to create an agent.');
      }
      const agentConfig = await fetchConfiguration(options.config);
      if (!agentConfig) {
        throw new Error(`Invalid Agent configuration: ${options.config}`);
      }

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
      context.orgId = createdAgent.organization.id;
      context.tenantId = createdAgent.organization.tenant_id;
      context.hostId = createdAgent.host_id;
      context.agentId = createdAgent.id;
    }

    // Extract and cache user context
    updateTelemetryContext(context);

    // Add agent to local config.
    addAgent({
      id,
      name,
      workspace: workspacePath,
      configuration: configurationKey,
      engine: configManager.get('engine'),
      remote_exec: remoteExecConfig ?? undefined,
      org_id: context.orgId,
      tenant_id: context.tenantId,
      host_id: context.hostId,
    });

    logger.stop(`Agent ${id} ${options.agentId ? 'retrieved' : 'created'}`);
  } catch (error) {
    logger.stop('Failed to initialize agent', 1);
    throw error;
  }
};
