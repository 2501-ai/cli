import fs from 'fs';
import path from 'path';
import os from 'os';

import Logger from '../utils/logger';
import { getDirectoryMd5Hash, getDirectoryFiles } from '../utils/files';
import { WorkspaceDiff, WorkspaceState } from '../utils/types';
import { DEFAULT_MAX_DEPTH, DEFAULT_MAX_DIR_SIZE } from '../constants';
import { IgnoreManager } from '../utils/ignore';
import { zipUtility } from '../utils/zip';
import { toReadableSize } from '../utils/files';

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

/**
 * Gets workspace state and changes in a single pass
 */
export async function getWorkspaceState(workspace: string, agentId: string) {
  // Compute hash only once
  const currentState = getDirectoryMd5Hash({
    directoryPath: workspace,
  });

  const oldState = readWorkspaceState(workspace, agentId);

  const diff = getWorkspaceDiff(oldState, {
    state_hash: currentState.md5,
    file_hashes: currentState.fileHashes,
    path: workspace,
    agent_id: agentId,
  });

  return {
    currentState,
    diff,
  };
}

// Modify getWorkspaceChanges to use the shared computation
export async function getWorkspaceChanges(workspace: string, agentId: string) {
  const { diff } = await getWorkspaceState(workspace, agentId);
  return diff;
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

// Modify generateWorkspaceZip to accept pre-computed state
export async function generateWorkspaceZip(
  workspace: string,
  workspaceFiles?: { fileHashes: Map<string, string>; totalSize: number }
): Promise<{ path: string; data: Buffer }[]> {
  const fileId = Math.floor(Math.random() * 100000);
  const outputFilePath = `/tmp/2501/_files/workspace_${fileId}.zip`;

  // Create output directory if it doesn't exist
  const dir = path.dirname(outputFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Use provided files or compute if not provided
  const files =
    workspaceFiles ||
    getDirectoryFiles({
      currentPath: '',
      currentDepth: 0,
      maxDepth: DEFAULT_MAX_DEPTH,
      maxDirSize: DEFAULT_MAX_DIR_SIZE,
      directoryPath: workspace,
      currentTotalSize: 0,
      ignoreManager: IgnoreManager.getInstance(),
    });

  // No files, no workspace ZIP
  if (files.fileHashes.size === 0) {
    return [];
  }

  Logger.debug('Total workspace size: ' + toReadableSize(files.totalSize));
  Logger.debug('Files in workspace: ' + files.fileHashes.size);

  // Prepare files for ZIP creation
  const zipFiles = Array.from(files.fileHashes.keys()).map((relativePath) => ({
    path: path.join(workspace, relativePath),
    relativePath,
    size: fs.statSync(path.join(workspace, relativePath)).size,
  }));

  await zipUtility.createZip(zipFiles, {
    outputPath: outputFilePath,
    maxTotalSize: DEFAULT_MAX_DIR_SIZE,
  });

  // Return the ZIP file information
  return [
    {
      path: outputFilePath,
      data: fs.readFileSync(outputFilePath),
    },
  ];
}
