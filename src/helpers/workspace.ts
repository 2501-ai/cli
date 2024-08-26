import fs from 'fs';
import path from 'path';
import axios from 'axios';
import PDFDocument from 'pdfkit';
import { FormData } from 'formdata-node';

import { isText } from 'istextorbinary';

import { readConfig } from '../utils/conf';

import { API_HOST, API_VERSION } from '../constants';
import os from 'os';
import crypto from 'crypto';
import { getDirectoryMd5Hash } from '../utils/files';
import { Logger } from '../utils/logger';
import { WorkspaceState, WorkspaceDiff } from '../utils/types';

axios.defaults.baseURL = `${API_HOST}${API_VERSION}`;
axios.defaults.timeout = 8000;

export const IGNORED_FILE_PATTERNS = [
  '.env',
  'venv',
  '__pycache__',
  'yarn.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn-error.log',
  'node_modules',
  'build',
  'dist',
  '*.log',
  'out',
  '.DS_Store',
  'Thumbs.db',
  '.cache',
  '*.tmp',
  '*.temp',
  '.svn',
  '.svg',
  '.hg',
  'vendor',
  '*.pyc',
  '__pycache__',
  'bin',
  'obj',
  '*.class',
  '*.bak',
  '*.swp',
  '*.env.local',
  '*.env.development',
  '*.env.production',
  'secrets.json',
  'credentials.xml',
  '(?:^|/).[^/]*$', // Ignore directories starting with .
];

async function createPDFFromFolder(
  targetFolder: string,
  outputFilePath: string,
  ignoreFiles: string[] = IGNORED_FILE_PATTERNS
): Promise<void> {
  const ignorePatterns = ignoreFiles.map(
    (file) =>
      new RegExp(
        '^' + file.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*')
      )
  );

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();

    const dir = path.dirname(outputFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const stream = fs.createWriteStream(outputFilePath);

    stream.on('finish', () => resolve());
    stream.on('error', reject);

    doc.pipe(stream);

    function addFilesFromDirectory(
      directory: string,
      relativePath: string = ''
    ) {
      const files = fs.readdirSync(directory);
      for (const file of files) {
        // Create a full path to match against ignore patterns
        const fullPath = path.join(relativePath, file);

        const filePath = path.join(directory, file);
        const fileStats = fs.statSync(filePath);

        if (
          ignorePatterns.some((pattern) => pattern.test(fullPath)) ||
          (fileStats.isDirectory() && file.startsWith('.'))
        ) {
          continue;
        }

        if (fileStats.isDirectory()) {
          addFilesFromDirectory(filePath, path.join(relativePath, file));
        } else if (fileStats.isFile()) {
          doc.addPage();
          doc
            .fontSize(12)
            .text(`File: ${fullPath}`, {
              underline: true,
            })
            .moveDown(0.5);
          if (isText(file) && fileStats.size < 500 * 1024) {
            const fileContent = fs.readFileSync(filePath, 'utf8');
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
              .text('Content omitted (not text file or too large)')
              .moveDown(0.5);
          }
        }
      }
    }

    addFilesFromDirectory(targetFolder);
    doc.end();
  });
}

async function getPDFsFromWorkspace(directory: string): Promise<string[]> {
  const pdfs: string[] = [];
  const files = fs.readdirSync(directory);
  for (const file of files) {
    const filePath = path.join(directory, file);
    const fileStats = fs.statSync(filePath);

    if (fileStats.isDirectory() && !file.startsWith('.')) {
      await getPDFsFromWorkspace(filePath);
    } else if (fileStats.isFile()) {
      if (file.toLowerCase().endsWith('.pdf')) pdfs.push(filePath);
    }
  }

  return pdfs;
}

async function getContextFromWorkspace(workspace: string) {
  // Note : Create a concatenated PDF of the workspace
  const fileId = Math.floor(Math.random() * 100000);
  const outputFilePath = `/tmp/2501/_files/workspace_${fileId}.pdf`;

  const ignorePatterns = IGNORED_FILE_PATTERNS.map(
    (file) =>
      new RegExp(
        '^' + file.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*')
      )
  );

  const files = fs.readdirSync(workspace).filter((file) => {
    const isDirectory = fs.statSync(path.join(workspace, file)).isDirectory();
    return (
      !ignorePatterns.some((pattern) => pattern.test(file)) &&
      !(isDirectory && file.startsWith('.'))
    );
  });
  // no files, no workspace PDF
  if (files.length === 0) return [];

  await createPDFFromFolder(workspace, outputFilePath)
    .then(() => Logger.debug('Agent : Workspace files unified.'))
    .catch((err) =>
      Logger.error('Agent : An error occurred while generating the PDF:' + err)
    );

  const pdfs = await getPDFsFromWorkspace(workspace);

  return [outputFilePath].concat(pdfs).map((pdf) => {
    return {
      path: pdf,
      data: fs.readFileSync(pdf),
    };
  });
}

export async function getFileFromWorkspace(path: string) {
  if (!fs.existsSync(path)) return 'NO FILE YET';
  const content = fs.readFileSync(path, { encoding: 'utf-8' });
  return Buffer.from(content).toString();
}

export async function syncWorkspaceFiles(
  workspace: string
): Promise<{ data: FormData | null; files: { id: string; name: string }[] }> {
  const files: { path: string; data: Buffer }[] =
    await getContextFromWorkspace(workspace);
  if (!files.length) {
    return { data: null, files: [] };
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

  return { data, files: response.data };
}

export async function indexWorkspaceFiles(agentName: string, data: FormData) {
  const config = readConfig();
  await axios.post(`/files/index?agent=${agentName}`, data, {
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
 * Synchronize the workspace state with the current state of the workspace.
 * This function will update the hash and files properties of the workspace state.
 */
export async function syncWorkspaceState(workspace: string): Promise<boolean> {
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
