import { RemoteExecutor } from './remoteExecutor';
import { InitCommandOptions } from '../commands/init';
import Logger from '../utils/logger';
import { REMOTE_EXEC_TYPES, RemoteExecConfig } from '../utils/types';

function isRemoteExecType(type: string): type is RemoteExecConfig['type'] {
  return REMOTE_EXEC_TYPES.includes(type as any);
}

function configureRemoteExecution(options: {
  remoteExec?: string;
  remoteExecType?: string;
  remoteExecPassword?: string;
  remotePrivateKey?: string;
  remoteWorkspace?: string;
}): RemoteExecConfig {
  if (!options.remoteExec) {
    throw new Error('Remote execution is not enabled');
  }

  // Parse connection string: user@host:port
  const match = options.remoteExec.match(
    /^([^@]+)@((?:\d{1,3}\.){3}\d{1,3}|[a-zA-Z0-9.-]+):(\d+)$/
  );
  if (!match) {
    Logger.error('Invalid remote execution format. Use: user@host:port');
    process.exit(1);
  }
  const [, user, host, port = '22'] = match;

  const execType = options.remoteExecType || 'unix';
  if (!isRemoteExecType(execType)) {
    Logger.error('Invalid remote execution type. Use: unix or win');
    process.exit(1);
  }

  const remoteWorkspace =
    execType === 'win' ? `C:\\Users\\${user}` : `/home/${user}`;

  return {
    enabled: true,
    target: host,
    port: parseInt(port),
    type: execType,
    user: user,
    password: options.remoteExecPassword,
    private_key: options.remotePrivateKey,
    remote_workspace: options.remoteWorkspace || remoteWorkspace,
  };
}

export async function initRemoteExecution(
  options: InitCommandOptions,
  logger: Logger
): Promise<RemoteExecConfig | undefined> {
  // Validate remote connection if configured
  if (!options?.remoteExec) {
    return;
  }

  const remoteExecConfig = configureRemoteExecution(options);
  RemoteExecutor.instance.init(remoteExecConfig);
  try {
    logger.start('Testing remote connection...');
    const isValid = await RemoteExecutor.instance.validateConnection();

    if (!isValid) {
      logger.cancel(
        'Remote connection validation failed. Please check your settings.'
      );
    } else {
      logger.stop('Remote connection validated successfully');
    }
  } catch (error) {
    logger.cancel(
      `Remote connection validation failed: ${(error as Error).message}`
    );
  }

  return remoteExecConfig;
}
