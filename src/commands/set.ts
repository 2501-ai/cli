import { ConfigManager } from '../managers/configManager';
import Logger from '../utils/logger';
import { LocalConfigKey, REMOTE_EXEC_TYPES } from '../utils/types';
import { RemoteExecutor } from '../managers/remoteExecutor';
import { WinRMExecutor } from '../managers/winrmExecutor';

// Keys that need to be parsed as JSON (boolean)
const KEYS_WITH_PARSING: LocalConfigKey[] = [
  'stream',
  'disable_spinner',
  'auto_update',
];
const logger = new Logger();

export async function setCommand(
  key: string,
  value?: string,
  extraValue?: string
) {
  const configKey = key as LocalConfigKey;

  if (!configKey) {
    logger.cancel('Please provide a key to set.');
    return;
  }

  // Special handling for remote_exec
  if (configKey === 'remote_exec') {
    await handleRemoteExecSet(value, extraValue);
    return;
  }

  if (!value) {
    logger.cancel('Please provide a value to set.');
    return;
  }

  try {
    // Parse boolean values
    let parsedValue: any = value;
    if (KEYS_WITH_PARSING.includes(configKey)) {
      parsedValue = JSON.parse(value);
    }

    ConfigManager.instance.set(configKey, parsedValue);
    logger.log(`${configKey} set successfully to ${parsedValue}.`);
  } catch (error) {
    logger.cancel((error as Error).message);
  }
}

async function handleRemoteExecSet(
  value?: string,
  extraValue?: string
): Promise<void> {
  if (!value) {
    logger.cancel('Please provide a value to set.');
    return;
  }

  const configManager = ConfigManager.instance;

  // Handle disable case
  if (value === 'false') {
    configManager.set('remote_exec', false);
    logger.log('Remote execution disabled.');
    return;
  }

  Logger.debug('Setting remote exec:', { value, extraValue });

  // Parse connection string: user@host:port
  if (!validateConnectionString(value)) {
    logger.cancel('Invalid format. Use: user@host:port [unix|win] or false');
    return;
  }

  const [, user, host, port = '22'] = value.match(/^(.+)@(.+):?(\d+)?$/)!;
  const type = extraValue || 'unix';

  Logger.debug('Parsed connection string:', { user, host, port, type });

  if (!REMOTE_EXEC_TYPES.includes(type as any)) {
    logger.cancel('Invalid type. Use: unix or win');
    return;
  }

  // Set all values
  configManager.set('remote_exec', true);
  configManager.set('remote_exec_user', user);
  configManager.set('remote_exec_target', host);
  configManager.set('remote_exec_port', parseInt(port));
  configManager.set('remote_exec_type', type as any);

  logger.log(`Remote execution enabled: ${user}@${host}:${port} (${type})`);

  // Test connection with appropriate executor
  logger.start('Testing connection...');

  const isValid =
    type === 'win'
      ? WinRMExecutor.instance.validateConnection()
      : RemoteExecutor.instance.validateConnection();
  if (!isValid) {
    logger.cancel('Connection failed. Please check your settings.');
    return;
  }

  logger.stop('Connection successful');
}

function validateConnectionString(connectionString: string): boolean {
  if (!connectionString) {
    return false;
  }

  Logger.debug('Validating connection string:', connectionString);

  const regex = /^[a-zA-Z0-9_\-\.]+@[a-zA-Z0-9_\-\.]+(:\d+)?$/;

  if (!regex.test(connectionString)) {
    return false;
  }

  const [, user, host, port = '22'] =
    connectionString.match(/^(.+)@(.+):?(\d+)?$/)!;

  Logger.debug('Parsed connection string bis:', { user, host, port });

  // Validate port range
  const portNum = parseInt(port);
  if (portNum < 1 || portNum > 65535) {
    return false;
  }

  // Basic hostname validation
  if (host.length === 0 || user.length === 0) {
    return false;
  }

  return true;
}
