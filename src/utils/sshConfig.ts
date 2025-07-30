import fs from 'fs';
import path from 'path';
import os from 'os';
import Logger from './logger';

/**
 * SSH config entry interface
 */
export interface SSHConfigEntry {
  host: string;
  hostname?: string;
  user?: string;
  port?: string;
  identityFile?: string;
}

/**
 * Parsed connection details
 */
export interface ConnectionDetails {
  user: string;
  host: string; // The actual hostname/IP for connections
  port: string;
  identityFile?: string;
}

/**
 * Parse SSH config file and return host entries
 */
function parseSSHConfigFile(configPath: string): Map<string, SSHConfigEntry> {
  const configs = new Map<string, SSHConfigEntry>();

  if (!fs.existsSync(configPath)) {
    return configs;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const lines = content.split('\n');

    let currentHost: SSHConfigEntry | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (isCommentOrEmpty(trimmed)) {
        continue;
      }

      const [key, ...valueParts] = trimmed.split(/\s+/);
      const value = valueParts.join(' ');

      if (isHostDirective(key)) {
        currentHost = saveAndCreateNewHost(configs, currentHost, value);
      } else if (currentHost) {
        addPropertyToHost(currentHost, key, value);
      }
    }
    // Save the last host
    saveHost(configs, currentHost);
  } catch (error) {
    Logger.debug(`Failed to parse SSH config ${configPath}: ${error}`);
  }

  return configs;
}

function isCommentOrEmpty(line: string): boolean {
  return !line || line.startsWith('#');
}

function isHostDirective(key: string): boolean {
  return key.toLowerCase() === 'host';
}

function saveAndCreateNewHost(
  configs: Map<string, SSHConfigEntry>,
  currentHost: SSHConfigEntry | null,
  hostValue: string
): SSHConfigEntry {
  saveHost(configs, currentHost);
  return { host: hostValue };
}

function saveHost(
  configs: Map<string, SSHConfigEntry>,
  host: SSHConfigEntry | null
): void {
  if (host) {
    configs.set(host.host, host);
  }
}

function addPropertyToHost(
  host: SSHConfigEntry,
  key: string,
  value: string
): void {
  switch (key.toLowerCase()) {
    case 'hostname':
      host.hostname = value;
      break;
    case 'user':
      host.user = value;
      break;
    case 'port':
      host.port = value;
      break;
    case 'identityfile':
      host.identityFile = value;
      break;
  }
}

/**
 * Get SSH config entries from user's SSH config file
 */
export function getSSHConfigEntries(): Map<string, SSHConfigEntry> {
  const sshConfigPath = path.join(os.homedir(), '.ssh', 'config');
  return parseSSHConfigFile(sshConfigPath);
}

/**
 * Look up connection details from SSH config
 */
export function lookupConnectionInSSHConfig(
  connectionString: string,
  defaultPort: string
): ConnectionDetails | null {
  const sshConfigs = getSSHConfigEntries();
  const { hostToLookup, userOverride, portOverride } =
    parseConnectionOverrides(connectionString);

  const configEntry = sshConfigs.get(hostToLookup);
  if (!configEntry) {
    return null;
  }

  return buildConnectionDetails(
    configEntry,
    hostToLookup,
    userOverride,
    portOverride,
    defaultPort
  );
}

function parseConnectionOverrides(connectionString: string): {
  hostToLookup: string;
  userOverride?: string;
  portOverride?: string;
} {
  let hostToLookup = connectionString;
  let userOverride: string | undefined;
  let portOverride: string | undefined;

  // Extract user override if present (user@host)
  const userMatch = connectionString.match(/^([^@]+)@(.+)$/);
  if (userMatch) {
    userOverride = userMatch[1];
    hostToLookup = userMatch[2];
  }

  // Extract port override if present (host:port)
  const portMatch = hostToLookup.match(/^(.+):(\d+)$/);
  if (portMatch) {
    hostToLookup = portMatch[1];
    portOverride = portMatch[2];
  }

  return { hostToLookup, userOverride, portOverride };
}

function buildConnectionDetails(
  configEntry: SSHConfigEntry,
  hostToLookup: string,
  userOverride?: string,
  portOverride?: string,
  defaultPort: string = '22'
): ConnectionDetails {
  const user = userOverride || configEntry.user || os.userInfo().username;
  const host = configEntry.hostname || hostToLookup;
  const port = portOverride || configEntry.port || defaultPort;
  const identityFile = configEntry.identityFile;

  return { user, host, port, identityFile };
}

/**
 * Check if SSH config file exists
 */
export function hasSSHConfig(): boolean {
  const sshConfigPath = path.join(os.homedir(), '.ssh', 'config');
  return fs.existsSync(sshConfigPath);
}

/**
 * Get SSH config file path
 */
export function getSSHConfigPath(): string {
  return path.join(os.homedir(), '.ssh', 'config');
}
