import { RemoteExecutor } from './remoteExecutor';
import { InitCommandOptions } from '../commands/init';
import Logger from '../utils/logger';
import { REMOTE_EXEC_TYPES, RemoteExecConfig } from '../utils/types';

/**
 * Utility function to check if a string is a valid remote execution type.
 * @param type - The type to check.
 * @returns True if the type is a valid remote execution type, false otherwise.
 */
function isRemoteExecType(type: string): type is RemoteExecConfig['type'] {
  return REMOTE_EXEC_TYPES.includes(type as any);
}

/**
 * Parse the connection string into a user, host, and port.
 * @param connectionString - The connection string to parse (ex: user@host:port or user@host).
 * @returns The user, host, and port.
 */
export function parseConnectionString(
  connectionString: string,
  remoteExecType: RemoteExecConfig['type'] = 'ssh'
): {
  user: string;
  host: string;
  port: string;
} {
  // Parse connection part: user@host:port or user@host (defaults to port 22)
  const connectionWithPortMatch = connectionString.match(
    /^([^@]+)@((?:\d{1,3}\.){3}\d{1,3}|[a-zA-Z0-9.-]+):(\d+)$/
  );

  const defaultPort = remoteExecType === 'winrm' ? '5985' : '22';
  if (connectionWithPortMatch) {
    const [, user, host, port = defaultPort] = connectionWithPortMatch;
    return { user, host, port };
  }

  // Try matching user@host without port
  const connectionWithoutPortMatch = connectionString.match(
    /^([^@]+)@((?:\d{1,3}\.){3}\d{1,3}|[a-zA-Z0-9.-]+)$/
  );

  if (connectionWithoutPortMatch) {
    const [, user, host] = connectionWithoutPortMatch;
    return { user, host, port: defaultPort }; // use default port
  }

  throw new Error(
    'Invalid connection format. Use: user@host:port or user@host'
  );
}

/**
 * Configure the remote execution.
 *
 * Parse connection string: user@host:port [type]
 * Examples:
 *   - administrator@host:22 ssh
 *   - administrator@host:5985 winrm
 *   - administrator@host:22 (defaults to ssh)
 *   - administrator@host (defaults to ssh and port 22)
 *
 * @param options - The options to configure the remote execution.
 * @returns The remote execution configuration.
 * @throws An error if the connection string is invalid.
 */
export function configureRemoteExecution(
  options: InitCommandOptions
): RemoteExecConfig {
  if (!options.remoteExec) {
    throw new Error('Remote execution is not enabled');
  }

  const remoteExecType = options.remoteExecType ?? 'ssh';
  if (!isRemoteExecType(remoteExecType)) {
    throw new Error('Invalid remote execution type. Use: ssh or winrm');
  }
  const { user, host, port } = parseConnectionString(
    options.remoteExec,
    remoteExecType
  );

  return {
    enabled: true,
    target: host,
    port: parseInt(port),
    type: remoteExecType,
    user: user,
    platform: remoteExecType === 'winrm' ? 'windows' : 'unix',
    password: options.remoteExecPassword,
    private_key: options.remotePrivateKey,
    remote_workspace: options.remoteWorkspace || '',
  };
}

/**
 * Initialize the remote execution.
 *
 * 1. Validate the connection string.
 * 2. Initialize the remote execution.
 * 3. Detect the platform.
 * 4. Adjust the workspace path based on the platform.
 *
 * @param options - The options to initialize the remote execution.
 * @param logger - The logger to use.
 * @returns The remote execution configuration.
 */
export async function initRemoteExecution(
  options: InitCommandOptions,
  logger: Logger
): Promise<RemoteExecConfig | undefined> {
  // Validate remote connection if configured
  if (!options?.remoteExec) {
    return;
  }

  // Validate the connection string.
  let remoteExecConfig: RemoteExecConfig;
  try {
    remoteExecConfig = configureRemoteExecution(options);
  } catch (error) {
    logger.cancel(
      `Remote connection configuration failed: ${(error as Error).message}`
    );
    process.exit(1);
  }

  // Initialize executor to run the detection command
  RemoteExecutor.instance.init(remoteExecConfig);

  try {
    logger.start(
      `Connecting to remote host ${remoteExecConfig.target} using ${remoteExecConfig.type}...`
    );
    // Detect platform and adjust workspace if needed
    const isValid = await RemoteExecutor.instance.validateConnection();
    if (!isValid) {
      logger.cancel('Remote connection failed. Please check your settings.');
      process.exit(1);
    }

    const { platform } = RemoteExecutor.instance.getConfig();

    logger.message(`Detected platform: ${platform}`);

    logger.stop('Remote connection validated successfully');

    // Adjust workspace path based on detected platform if user didn't specify one
    if (!options.remoteWorkspace) {
      const adjustedWorkspace =
        platform === 'windows'
          ? `C:\\Users\\${remoteExecConfig.user}`
          : `/home/${remoteExecConfig.user}`;

      remoteExecConfig.remote_workspace = adjustedWorkspace;
      Logger.debug(`Adjusted workspace path to: ${adjustedWorkspace}`);
    }
  } catch (error) {
    logger.cancel(
      `Remote connection validation failed: ${(error as Error).message}`
    );
    process.exit(1);
  }

  return remoteExecConfig;
}

/**
 * Helper function to check if a Windows command was found.
 */
export function isCommandNotFound(output: string): boolean {
  const lowerOutput = output.toLowerCase();
  return (
    lowerOutput.includes('not recognized as an internal or external command') ||
    lowerOutput.includes('is not recognized') ||
    lowerOutput.includes('command not found') ||
    lowerOutput.includes('was not found') ||
    lowerOutput.includes('could not find')
  );
}
