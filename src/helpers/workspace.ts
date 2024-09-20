import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { FormData } from 'formdata-node';
import os from 'os';
import crypto from 'crypto';

import { API_HOST, API_VERSION } from '../constants';

import Logger from '../utils/logger';
import { readConfig } from '../utils/conf';
import { getDirectoryMd5Hash } from '../utils/files';
import { WorkspaceDiff, WorkspaceState } from '../utils/types';
import { generatePDFs } from '../utils/pdf';

axios.defaults.baseURL = `${API_HOST}${API_VERSION}`;
axios.defaults.timeout = 120 * 1000;

export async function uploadWorkspaceFile(workspace: string): Promise<{
  files: { path: string; data: Buffer }[];
  vectorStoredFiles: { id: string; name: string }[];
}> {
  const files = await generatePDFs(workspace);
  if (!files.length) {
    return { files: [], vectorStoredFiles: [] };
  }

  const data = new FormData();
  for (let i = 0; i < files.length; i++) {
    const name = files[i].path.split('/').pop();
    data.set('file' + i, new Blob([files[i].data]), name);
  }

  const config = readConfig();
  const response = await axios.post<{ id: string; name: string }[]>(
    '/files',
    data,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: `Bearer ${config?.api_key}`,
      },
    }
  );

  if (process.env.NODE_ENV !== 'dev') {
    // Don't pollute the filesystem with temporary files
    fs.unlinkSync(files[0].path);
    Logger.debug('Agent : Workspace PDF deleted:', files[0].path);
  }

  return { files, vectorStoredFiles: response.data };
}

export async function indexWorkspaceFiles(
  agentId: string,
  files: { path: string; data: Buffer }[],
  filesIds: { id: string; name: string }[]
) {
  const config = readConfig();

  const data = new FormData();
  for (let i = 0; i < files.length; i++) {
    const name = files[i].path.split('/').pop();
    data.set('file' + i, new Blob([files[i].data]), name);
  }

  data.set('fileIds', JSON.stringify(filesIds.map((file) => file.id)));

  await axios.post(`/agents/${agentId}/files/index`, data, {
    headers: {
      'Content-Type': 'multipart/form-data',
      Authorization: `Bearer ${config?.api_key}`,
    },
  });
}

export function getWorkspaceConfName(workspace: string): string {
  // md5 hash of workspace path (better than to use the path in the config name...)
  const hash = crypto.createHash('md5').update(workspace).digest('hex');
  return path.join(
    path.join(os.homedir(), '.2501'),
    `workspace_state_${hash}.conf`
  );
}

export function readWorkspaceState(workspace: string): WorkspaceState {
  try {
    const filePath = getWorkspaceConfName(workspace);

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
    const filePath = getWorkspaceConfName(state.path);
    const entries = Object.fromEntries(state.file_hashes);
    const data = JSON.stringify({ ...state, file_hashes: entries }, null, 2);
    fs.writeFileSync(filePath, data, 'utf8');
  } catch (error) {
    Logger.error('Error writing workspace state:', error);
    throw error;
  }
}

/**
 * Synchronize the workspace state locally with the current state of the workspace.
 *
 * This function will update the hash and files properties of the workspace state.
 */
export async function syncWorkspaceState(workspace: string): Promise<boolean> {
  Logger.debug('Syncing workspace state:', workspace);
  const currentState = readWorkspaceState(workspace);
  const { md5, fileHashes } = await getDirectoryMd5Hash({
    directoryPath: workspace,
  });
  const hasChanged = currentState.state_hash !== md5;
  currentState.state_hash = md5; // hash of the current state.
  currentState.file_hashes = fileHashes; // file hashes of the current state.
  writeWorkspaceState(currentState);
  return hasChanged;
}

export async function getWorkspaceChanges(workspace: string) {
  const oldState = readWorkspaceState(workspace);
  const newState = await getDirectoryMd5Hash({
    directoryPath: workspace,
  });

  return getWorkspaceDiff(oldState, {
    state_hash: newState.md5,
    file_hashes: newState.fileHashes,
    path: workspace,
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

  return { added, removed, modified, hasChanges };
}

export async function synchroniseWorkspaceChanges(
  agentId: string,
  workspace: string
) {
  Logger.debug('Agent : Workspace has changes, synchronizing...');
  await syncWorkspaceState(workspace);
  // TODO: improve and send only changed files ?
  const workspaceResponse = await uploadWorkspaceFile(workspace);
  if (
    workspaceResponse?.vectorStoredFiles &&
    workspaceResponse?.vectorStoredFiles.length
  ) {
    await indexWorkspaceFiles(
      agentId,
      workspaceResponse.files,
      workspaceResponse.vectorStoredFiles
    );
  }
}
