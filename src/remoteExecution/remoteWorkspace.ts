import { RemoteExecutor } from './remoteExecutor';
import { InitCommandOptions } from '../commands/init';
import Logger from '../utils/logger';
import { RemoteExecConfig } from '../utils/types';

/**
 * Ensure remote workspace directory exists, creating it if missing
 */
export async function ensureRemoteWorkspaceExists(
  isWindows: boolean,
  workspacePath: string
): Promise<void> {
  // mkdir -p (Unix) and "if not exist" (Windows) are idempotent
  const createCommand = isWindows
    ? `if not exist "${workspacePath}" mkdir "${workspacePath}"`
    : `mkdir -p "${workspacePath}"`;

  Logger.debug(`Ensuring remote workspace directory exists: ${workspacePath}`);
  await RemoteExecutor.instance.executeCommand(createCommand, undefined, true);
  Logger.debug(`Remote workspace directory ready: ${workspacePath}`);
}

/**
 * Setup the remote workspace directory.
 */
export async function setupRemoteWorkspace(
  remoteExecConfig: RemoteExecConfig,
  options: InitCommandOptions
): Promise<string> {
  const isWindows = remoteExecConfig.platform === 'windows';

  // Determine workspace path
  let workspacePath = options.remoteWorkspace;
  // TODO: This is hardcoded for now, but agents should always have a workspace defined in DB.
  // We will fix this ASAP.
  if (!workspacePath) {
    workspacePath = isWindows
      ? 'C:\\ProgramData\\2501\\'
      : `/home/${remoteExecConfig.user}/.2501/workspace`;
    Logger.debug(`Using default workspace path: ${workspacePath}`);
  }

  await ensureRemoteWorkspaceExists(isWindows, workspacePath);
  return workspacePath;
}
