import { InitCommandOptions } from '../commands/init';
import Logger from '../utils/logger';
import {
  ConnectionDetails,
  getSSHConfigPath,
  hasSSHConfig,
  lookupConnectionInSSHConfig,
} from '../utils/sshConfig';
import { REMOTE_EXEC_TYPES, RemoteExecConfig } from '../utils/types';

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
 * Host validation patterns
 */
const HOST_PATTERNS = {
  WITH_PORT: /^((?:\d{1,3}\.){3}\d{1,3}|[a-zA-Z0-9.-]+):(\d+)$/,
  WITHOUT_PORT: /^((?:\d{1,3}\.){3}\d{1,3}|[a-zA-Z0-9.-]+)$/,
} as const;

/**
 * Try to parse explicit connection patterns (user@host:port or user@host)
 * Supports any username format including emails (user@domain.com) and
 * Windows domain users (DOMAIN\user) by splitting on the last @ symbol.
 */
function tryParseExplicitConnection(
  connectionString: string,
  defaultPort: string
): ConnectionDetails | null {
  const lastAtIndex = connectionString.lastIndexOf('@');
  if (lastAtIndex === -1) return null;

  const user = connectionString.substring(0, lastAtIndex);
  const hostPortPart = connectionString.substring(lastAtIndex + 1);

  // Try host:port pattern
  const portMatch = hostPortPart.match(HOST_PATTERNS.WITH_PORT);
  if (portMatch) return { user, host: portMatch[1], port: portMatch[2] };

  // Try host pattern (without port)
  const hostMatch = hostPortPart.match(HOST_PATTERNS.WITHOUT_PORT);
  if (hostMatch) return { user, host: hostMatch[1], port: defaultPort };

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
    Logger.log('sshConfigResult', { sshConfigResult });
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
    raw_ssh: options.rawSsh,
  };
}
