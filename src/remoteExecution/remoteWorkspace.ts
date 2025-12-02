import { RemoteExecutor } from './remoteExecutor';
import { InitCommandOptions } from '../commands/init';
import Logger from '../utils/logger';
import { RemoteExecConfig } from '../utils/types';

/**
 * Ensure remote workspace directory exists, creating it if missing
 */
async function ensureRemoteWorkspaceExists(
  remoteExecConfig: RemoteExecConfig,
  workspacePath: string
): Promise<void> {
  if (!workspacePath) {
    return;
  }

  const platform = remoteExecConfig.platform;
  const isWindows = platform === 'windows';
  const isSSH = remoteExecConfig.type === 'ssh';

  try {
    // For SSH with relative path, expand to home directory
    const resolvedPath =
      isSSH && !workspacePath.startsWith('/')
        ? `~/${workspacePath}`
        : workspacePath;

    // Single command to create directory if it doesn't exist
    // Unix: mkdir -p is idempotent
    // Windows: if not exist creates it, otherwise does nothing
    const createCommand = isWindows
      ? `if not exist "${resolvedPath}" mkdir "${resolvedPath}"`
      : `mkdir -p "${resolvedPath}"`;

    Logger.debug(`Ensuring remote workspace directory exists: ${resolvedPath}`);
    await RemoteExecutor.instance.executeCommand(
      createCommand,
      undefined,
      true
    );
    Logger.debug(`Remote workspace directory ready: ${resolvedPath}`);
  } catch (error) {
    Logger.debug(
      `Failed to ensure remote workspace exists: ${(error as Error).message}`
    );
    // Log warning but continue initialization
    Logger.debug(
      `Warning: Could not verify/create remote workspace directory. Continuing anyway.`
    );
  }
}

/**
 * Setup the remote workspace directory.
 */
export async function setupRemoteWorkspace(
  remoteExecConfig: RemoteExecConfig,
  options: InitCommandOptions
): Promise<string> {
  try {
    let remoteWorkspace = options.remoteWorkspace;
    if (!remoteWorkspace) {
      remoteWorkspace =
        remoteExecConfig.type === 'ssh'
          ? `/home/${remoteExecConfig.user}/.2501/workspace`
          : 'C:\\ProgramData\\2501\\';

      Logger.debug(
        `Default workspace path to: ${remoteExecConfig.remote_workspace}`
      );
    }
    await ensureRemoteWorkspaceExists(remoteExecConfig, remoteWorkspace);
    return remoteWorkspace;
  } catch (error) {
    throw new Error(
      `Remote connection validation failed: ${(error as Error).message}`
    );
  }
}
