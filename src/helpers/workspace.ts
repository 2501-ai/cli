import fs from 'fs';
import path from 'path';
import os from 'os';

import Logger from '../utils/logger';
import { getDirectoryMd5Hash } from '../utils/files';
import { WorkspaceDiff, WorkspaceState } from '../utils/types';

export function resolveWorkspacePath(options: { workspace?: string }): string {
  let finalPath = options.workspace || process.cwd();
  // Convert relative path to absolute path if necessary
  finalPath = path.isAbsolute(finalPath)
    ? finalPath
    : path.resolve(process.cwd(), finalPath);

  return finalPath;
}

export function getWorkspaceConfName(agentId: string): string {
  return path.join(
    path.join(os.homedir(), '.2501'),
    `workspace_state_${agentId}.conf`
  );
}

export function clearWorkspaceState(agentId: string): void {
  const filePath = getWorkspaceConfName(agentId);
  if (fs.existsSync(filePath)) {
    Logger.debug('Clearing workspace state:', filePath);
    fs.unlinkSync(filePath);
  }
}

export function readWorkspaceState(
  workspace: string,
  agentId: string
): WorkspaceState {
  try {
    const filePath = getWorkspaceConfName(agentId);

    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), {
        recursive: true,
      });
      fs.writeFileSync(
        filePath,
        JSON.stringify(
          <WorkspaceState>{
            file_hashes: new Map(),
            state_hash: '',
            path: workspace,
            agent_id: agentId,
          },
          null,
          2
        ),
        'utf8'
      );
    }
    const data = fs.readFileSync(filePath, 'utf8');
    const state = JSON.parse(data);
    state.file_hashes = new Map(Object.entries(state.file_hashes));
    return state;
  } catch (error) {
    Logger.error('Error reading workspace state:', error);
    throw error;
  }
}

export function writeWorkspaceState(state: WorkspaceState): void {
  try {
    const filePath = getWorkspaceConfName(state.agent_id);
    const entries = Object.fromEntries(state.file_hashes);
    const data = JSON.stringify({ ...state, file_hashes: entries }, null, 2);
    fs.writeFileSync(filePath, data, 'utf8');
  } catch (error) {
    Logger.error('Error writing workspace state:', error);
    throw error;
  }
}

/**
 * Update the workspace state locally with the current state of the workspace.
 *
 * This function will update the hash and files properties of the workspace state.
 */
export async function updateWorkspaceState(
  workspace: string,
  agentId: string
): Promise<boolean> {
  Logger.debug('Syncing workspace state:', workspace);
  const currentState = readWorkspaceState(workspace, agentId);
  const { md5, fileHashes } = getDirectoryMd5Hash({
    directoryPath: workspace,
  });
  const hasChanged = currentState.state_hash !== md5;
  currentState.state_hash = md5; // hash of the current state.
  currentState.file_hashes = fileHashes; // file hashes of the current state.
  writeWorkspaceState(currentState);
  return hasChanged;
}

export async function getWorkspaceChanges(workspace: string, agentId: string) {
  const oldState = readWorkspaceState(workspace, agentId);
  const newState = getDirectoryMd5Hash({
    directoryPath: workspace,
  });

  return getWorkspaceDiff(oldState, {
    state_hash: newState.md5,
    file_hashes: newState.fileHashes,
    path: workspace,
    agent_id: agentId,
  });
}

/**
 * Computes the difference between two workspace states.
 * @param oldState - The previous state of the workspace.
 * @param newState - The current state of the workspace.
 * @returns A WorkspaceDiff object containing arrays of added, removed, and modified files.
 */
export function getWorkspaceDiff(
  oldState: WorkspaceState,
  newState: WorkspaceState
): WorkspaceDiff {
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];

  // Check for added and modified files
  newState.file_hashes.forEach((newHash, filePath) => {
    if (!oldState.file_hashes.has(filePath)) {
      added.push(filePath);
    } else if (oldState.file_hashes.get(filePath) !== newHash) {
      modified.push(filePath);
    }
  });

  // Check for removed files
  oldState.file_hashes.forEach((_, filePath) => {
    if (!newState.file_hashes.has(filePath)) {
      removed.push(filePath);
    }
  });

  const hasChanges =
    added.length > 0 || removed.length > 0 || modified.length > 0;

  return {
    added,
    removed,
    modified,
    hasChanges,
    isEmpty: !newState.file_hashes.size,
  };
}
