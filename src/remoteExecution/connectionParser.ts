import { RemoteExecutor } from './remoteExecutor';
import { InitCommandOptions } from '../commands/init';
import Logger from '../utils/logger';
import { REMOTE_EXEC_TYPES, RemoteExecConfig } from '../utils/types';
import {
  lookupConnectionInSSHConfig,
  hasSSHConfig,
  getSSHConfigPath,
  ConnectionDetails,
} from '../utils/sshConfig';

/**
 * Connection string patterns for parsing
 */
const CONNECTION_PATTERNS = {
  USER_HOST_PORT: /^([^@]+)@((?:\d{1,3}\.){3}\d{1,3}|[a-zA-Z0-9.-]+):(\d+)$/,
  USER_HOST: /^([^@]+)@((?:\d{1,3}\.){3}\d{1,3}|[a-zA-Z0-9.-]+)$/,
} as const;

/**
 * Default ports for different remote execution types
 */
const DEFAULT_PORTS = {
  ssh: '22',
  winrm: '5985',
} as const;

/**
 * Utility function to check if a string is a valid remote execution type.
 */
function isRemoteExecType(type: string): type is RemoteExecConfig['type'] {
  return REMOTE_EXEC_TYPES.includes(type as any);
}

/**
 * Get default port for remote execution type
 */
function getDefaultPort(remoteExecType: RemoteExecConfig['type']): string {
  return DEFAULT_PORTS[remoteExecType];
}

/**
 * Try to parse explicit connection patterns (user@host:port or user@host)
 */
function tryParseExplicitConnection(
  connectionString: string,
  defaultPort: string
): ConnectionDetails | null {
  // Try user@host:port pattern
  const withPortMatch = connectionString.match(
    CONNECTION_PATTERNS.USER_HOST_PORT
  );
  if (withPortMatch) {
    const [, user, host, port] = withPortMatch;
    return { user, host, port };
  }

  // Try user@host pattern (without port)
  const withoutPortMatch = connectionString.match(
    CONNECTION_PATTERNS.USER_HOST
  );
  if (withoutPortMatch) {
    const [, user, host] = withoutPortMatch;
    return { user, host, port: defaultPort };
  }

  return null;
}

/**
 * Generate helpful error message for invalid connection strings
 */
function generateConnectionErrorMessage(connectionString: string): string {
  let message = 'Invalid connection format. Use: user@host:port or user@host';

  if (hasSSHConfig()) {
    message += `, or add '${connectionString}' to your SSH config file`;
  } else {
    message += `, or create an SSH config file at ${getSSHConfigPath()}`;
  }

  return message;
}

/**
 * Parse the connection string into user, host, and port.
 * Supports explicit formats and SSH config lookups.
 */
export function parseConnectionString(
  connectionString: string,
  remoteExecType: RemoteExecConfig['type'] = 'ssh'
): ConnectionDetails {
  const defaultPort = getDefaultPort(remoteExecType);

  // Try explicit connection patterns first
  const explicitResult = tryParseExplicitConnection(
    connectionString,
    defaultPort
  );

  //.TODO: add support for private key parsing
  if (explicitResult) {
    return explicitResult;
  }

  // Try SSH config lookup
  if (remoteExecType === 'ssh') {
    const sshConfigResult = lookupConnectionInSSHConfig(
      connectionString,
      defaultPort
    );
    console.log('sshConfigResult', { sshConfigResult });
    if (sshConfigResult) {
      return sshConfigResult;
    }
  }

  // All parsing attempts failed
  throw new Error(generateConnectionErrorMessage(connectionString));
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
 *   - host-name (SSH config lookup)
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

  const connectionDetails = parseConnectionString(
    options.remoteExec,
    remoteExecType
  );

  Logger.debug('connectionDetails', { connectionDetails });

  return {
    enabled: true,
    target: connectionDetails.host,
    port: parseInt(connectionDetails.port),
    type: remoteExecType,
    user: connectionDetails.user,
    platform: remoteExecType === 'winrm' ? 'windows' : 'unix',
    password: options.remoteExecPassword,
    private_key: connectionDetails.identityFile || options.remotePrivateKey,
    remote_workspace: options.remoteWorkspace || '',
  };
}

/**
 * Configure and validate remote execution setup
 */
export async function configureAndValidateRemoteExecution(
  options: InitCommandOptions,
  logger: Logger
): Promise<RemoteExecConfig | undefined> {
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

  return remoteExecConfig;
}

/**
 * Detect remote platform and adjust workspace path
 */
export async function detectPlatformAndAdjustWorkspace(
  remoteExecConfig: RemoteExecConfig,
  options: InitCommandOptions,
  logger: Logger
): Promise<void> {
  try {
    const { target, type, platform } = remoteExecConfig;
    logger.start(`Connecting to remote host ${target} using ${type}...`);

    const isValid = await RemoteExecutor.instance.validateConnection();
    if (!isValid) {
      logger.cancel('Remote connection failed. Please check your settings.');
      process.exit(1);
    }

    logger.message(`Detected platform: ${platform} for ${target}`);
    logger.stop('Remote connection validated successfully');

    adjustWorkspacePathIfNeeded(remoteExecConfig, options);
  } catch (error) {
    logger.cancel(
      `Remote connection validation failed: ${(error as Error).message}`
    );
    process.exit(1);
  }
}

/**
 * Adjust workspace path based on detected platform if user didn't specify one
 */
function adjustWorkspacePathIfNeeded(
  remoteExecConfig: RemoteExecConfig,
  options: InitCommandOptions
): void {
  if (options.remoteWorkspace) {
    return;
  }

  const adjustedWorkspace =
    remoteExecConfig.platform === 'windows'
      ? `C:\\Users\\${remoteExecConfig.user}`
      : `/home/${remoteExecConfig.user}`;

  remoteExecConfig.remote_workspace = adjustedWorkspace;
  Logger.debug(`Adjusted workspace path to: ${adjustedWorkspace}`);
}

/**
 * Helper function to check if a Windows command was found.
 */
export function isCommandNotFound(output: string): boolean {
  const lowerOutput = output.toLowerCase();
  const notFoundIndicators = [
    'not recognized as an internal or external command',
    'is not recognized',
    'command not found',
    'was not found',
    'could not find',
  ];

  return notFoundIndicators.some((indicator) =>
    lowerOutput.includes(indicator)
  );
}
