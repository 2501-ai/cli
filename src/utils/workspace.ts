import path from 'path';
import fs from 'fs';

import { getDirectoryFiles } from './files';
import Logger from './logger';
import { DEFAULT_MAX_DEPTH, DEFAULT_MAX_DIR_SIZE } from '../constants';
import { IgnoreManager } from './ignore';
import { zipUtility } from './zip';
import { toReadableSize } from './files';

/**
 * Generates a ZIP file from the workspace content
 */
export async function generateWorkspaceZip(workspace: string): Promise<
  {
    path: string;
    data: Buffer;
  }[]
> {
  const fileId = Math.floor(Math.random() * 100000);
  const outputFilePath = `/tmp/2501/_files/workspace_${fileId}.zip`;

  // Create output directory if it doesn't exist
  const dir = path.dirname(outputFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const ignoreManager = IgnoreManager.getInstance();

  // Use existing file collection logic
  const workspaceFiles = getDirectoryFiles({
    currentPath: '',
    currentDepth: 0,
    maxDepth: DEFAULT_MAX_DEPTH,
    maxDirSize: DEFAULT_MAX_DIR_SIZE,
    directoryPath: workspace,
    currentTotalSize: 0,
    ignoreManager,
  });

  // No files, no workspace ZIP
  if (workspaceFiles.fileHashes.size === 0) {
    return [];
  }

  Logger.debug(
    'Total workspace size: ' + toReadableSize(workspaceFiles.totalSize)
  );
  Logger.debug('Files in workspace: ' + workspaceFiles.fileHashes.size);

  // Prepare files for ZIP creation
  const files = Array.from(workspaceFiles.fileHashes.keys()).map(
    (relativePath) => ({
      path: path.join(workspace, relativePath),
      relativePath,
      size: fs.statSync(path.join(workspace, relativePath)).size,
    })
  );

  // Create ZIP file
  await zipUtility.createZip(files, {
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
