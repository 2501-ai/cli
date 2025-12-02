import { RemoteExecutor } from './remoteExecutor';
import { InitCommandOptions } from '../commands/init';
import Logger from '../utils/logger';
import { RemoteExecConfig } from '../utils/types';

/**
 * Check if remote workspace directory exists and create it if missing
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

    // Check if directory exists
    const checkCommand = isWindows
      ? `if exist "${resolvedPath}" echo exists`
      : `test -d "${resolvedPath}" && echo exists`;

    const checkResult = await RemoteExecutor.instance.executeCommand(
      checkCommand,
      undefined,
      true
    );

    const exists = checkResult.trim().includes('exists');

    if (!exists) {
      // Create directory
      const createCommand = isWindows
        ? `mkdir "${resolvedPath}"`
        : `mkdir -p "${resolvedPath}"`;

      Logger.debug(`Creating remote workspace directory: ${resolvedPath}`);
      await RemoteExecutor.instance.executeCommand(
        createCommand,
        undefined,
        true
      );
      Logger.debug(
        `Successfully created remote workspace directory: ${resolvedPath}`
      );
    } else {
      Logger.debug(
        `Remote workspace directory already exists: ${resolvedPath}`
      );
    }
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
