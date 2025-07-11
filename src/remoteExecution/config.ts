import Logger from '../utils/logger';
import { AgentConfig, REMOTE_EXEC_TYPES } from '../utils/types';

export function configureRemoteExecution(options: {
  remoteExec?: string;
  remoteExecType?: string;
  remoteExecPassword?: string;
}): AgentConfig['remote_exec'] {
  if (!options.remoteExec) {
    return undefined;
  }

  // Parse connection string: user@host:port
  const match = options.remoteExec.match(/^(.+)@(.+):?(\d+)?$/);
  if (!match) {
    Logger.error('Invalid remote execution format. Use: user@host:port');
    process.exit(1);
  }

  const [, user, host, port = '22'] = match;
  const execType = options.remoteExecType || 'unix';

  if (!REMOTE_EXEC_TYPES.includes(execType as any)) {
    Logger.error('Invalid remote execution type. Use: unix or win');
    process.exit(1);
  }

  return {
    enabled: true,
    target: host,
    port: parseInt(port),
    type: execType as any,
    user: user,
    password: options.remoteExecPassword,
  };
}
