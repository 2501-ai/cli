import fs from 'fs';
import path from 'path';
import axios from 'axios';
import PDFDocument from 'pdfkit';
import { FormData } from 'formdata-node';
import { isText } from 'istextorbinary';
import os from 'os';
import crypto from 'crypto';

import { API_HOST, API_VERSION, IGNORED_FILE_PATTERNS } from '../constants';

import Logger from '../utils/logger';
import { readConfig } from '../utils/conf';
import {
  computeFileMetadataHash,
  getDirectoryMd5Hash,
  toReadableSize,
} from '../utils/files';

import { WorkspaceDiff, WorkspaceState } from '../utils/types';

axios.defaults.baseURL = `${API_HOST}${API_VERSION}`;
axios.defaults.timeout = 8000;

/**
 * Create a PDF document from a list of files in a directory.
 * @param targetFolder - Path to the target directory
 * @param outputFilePath - Path to the output PDF file
 * @param fileList - List of files to include in the PDF
 */
function createPDFFromFiles(
  targetFolder: string,
  outputFilePath: string,
  fileList: string[]
): Promise<string> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();

    const dir = path.dirname(outputFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const stream = fs.createWriteStream(outputFilePath);

    stream.on('finish', () => resolve(outputFilePath));
    stream.on('error', reject);

    doc.pipe(stream);

    fileList.forEach((file) => {
      doc.addPage();
      doc
        .fontSize(12)
        .text(`File: ${file}`, {
          underline: true,
        })
        .moveDown(0.5);
      if (isText(file) && fs.statSync(file).size < 1024 * 1024) {
        const fileContent = fs.readFileSync(
          path.join(targetFolder, file),
          'utf8'
        );
        const lines = fileContent.split(/\r?\n/);
        lines.forEach((line, index) => {
          doc
            .fontSize(10)
            .text(`${index + 1}: ${line}`)
            .moveDown(0.2);
        });
      } else {
        doc
          .fontSize(10)
          .text('Content omitted (not text file or too big)')
          .moveDown(0.5);
      }
    });

    doc.end();
  });
}

/**
 * Get the list of files to ignore in the workspace, enriched with patterns from .gitignore if present.
 */
export function getIgnoredFiles(workspace: string): Set<string> {
  const ignorePatterns = new Set(IGNORED_FILE_PATTERNS);

  const hasGitIgnore = fs.existsSync(path.join(workspace, '.gitignore'));
  if (hasGitIgnore) {
    const gitIgnore = fs.readFileSync(
      path.join(workspace, '.gitignore'),
      'utf8'
    );
    gitIgnore
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.startsWith('#'))
      .map((v) => ignorePatterns.add(v));
  }

  return ignorePatterns;
}

async function generatePDFs(workspace: string): Promise<
  {
    path: string;
    data: Buffer;
  }[]
> {
  // Note : Create a concatenated PDF of the workspace
  const fileId = Math.floor(Math.random() * 100000);
  const outputFilePath = `/tmp/2501/_files/workspace_${fileId}.pdf`;

  const ignorePatterns = getIgnoredFiles(workspace);

  const workspaceFiles = await getWorkspaceFiles({
    currentPath: '',
    currentDepth: 0,
    ignoreSet: ignorePatterns,
    maxDepth: 10,
    directoryPath: workspace,
  });

  // no files, no workspace PDF
  if (workspaceFiles.fileHashes.size === 0) {
    return [];
  }

  Logger.debug(
    'Total workspace size: ' + toReadableSize(workspaceFiles.totalSize)
  );
  Logger.debug('Files in workspace: ' + workspaceFiles.fileHashes.size);

  await createPDFFromFiles(
    workspace,
    outputFilePath,
    Array.from(workspaceFiles.fileHashes.keys())
  );
  // .then(() => Logger.debug('Agent : Workspace files unified.'))
  // .catch((err) =>
  //   Logger.error('Agent : An error occurred while generating the PDF:' + err)
  // );

  return [outputFilePath].map((pdf) => {
    return {
      path: pdf,
      data: fs.readFileSync(pdf),
    };
  });
}

export async function getWorkspaceFiles(params: {
  currentPath: string;
  currentDepth: number;
  ignoreSet: Set<string>;
  maxDepth: number;
  directoryPath: string;
}): Promise<{ totalSize: number; fileHashes: Map<string, string> }> {
  // Limit the depth of directory traversal to avoid excessive resource usage
  if (params.currentDepth > params.maxDepth) {
    Logger.error('Directory depth exceeds the maximum allowed depth.');
    return {
      totalSize: 0,
      fileHashes: new Map<string, string>(),
    };
  }

  let totalSize = 0;
  const fileHashes = new Map<string, string>();

  const items = fs.readdirSync(
    path.join(params.directoryPath, params.currentPath),
    { withFileTypes: true }
  );

  await Promise.all(
    items.map(async (item) => {
      const itemPath = path.join(params.currentPath, item.name);

      if (params.ignoreSet.has(item.name)) {
        return; // Skip the item if it matches any of the ignore patterns
      }

      if (item.isDirectory()) {
        // Recursively process subdirectories
        const result = await getWorkspaceFiles({
          currentPath: itemPath,
          currentDepth: params.currentDepth + 1,
          ignoreSet: params.ignoreSet,
          maxDepth: params.maxDepth,
          directoryPath: params.directoryPath,
        });
        totalSize += result.totalSize;
        result.fileHashes.forEach((hash, relativePath) => {
          fileHashes.set(relativePath, hash);
        });
      } else if (item.isFile()) {
        // Use streaming to read file and compute MD5 hash
        const { hash: fileHash, size: fileSize } =
          computeFileMetadataHash(itemPath);
        totalSize += fileSize;
        // Include the relative file path in the hash to ensure unique content
        const relativePath = path.relative(params.directoryPath, itemPath);
        fileHashes.set(relativePath, fileHash);
        return { totalSize, fileHashes };
      }
    })
  );
  return {
    totalSize,
    fileHashes,
  };
}

export async function syncWorkspaceFiles(workspace: string): Promise<{
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
    timeout: 20000,
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
  const workspaceResponse = await syncWorkspaceFiles(workspace);
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
