import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { isText } from 'istextorbinary';

import { getDirectoryFiles, getIgnoredFiles, toReadableSize } from './files';
import Logger from './logger';
import { DEFAULT_MAX_DEPTH, DEFAULT_MAX_DIR_SIZE } from '../constants';

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

    fileList.forEach((file, index) => {
      if (index > 0) {
        doc.addPage();
      }
      doc
        .fontSize(10)
        .text(`File:${file}::END`, {
          underline: true,
        })
        .moveDown(0.5);
      if (isText(file) && fs.statSync(file).size < 1024 * 1024) {
        const fileContent = fs.readFileSync(
          path.join(targetFolder, file),
          'utf8'
        );
        const lines = fileContent.split(/\r?\n/);
        lines.forEach((line) => {
          doc.fontSize(10).text(line).moveDown(0.2);
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

export async function generatePDFs(workspace: string): Promise<
  {
    path: string;
    data: Buffer;
  }[]
> {
  // Note : Create a concatenated PDF of the workspace
  const fileId = Math.floor(Math.random() * 100000);
  const outputFilePath = `/tmp/2501/_files/workspace_${fileId}.pdf`;

  const ignorePatterns = getIgnoredFiles(workspace);

  const workspaceFiles = getDirectoryFiles({
    currentPath: '',
    currentDepth: 0,
    ignoreSet: ignorePatterns,
    maxDepth: DEFAULT_MAX_DEPTH,
    maxDirSize: DEFAULT_MAX_DIR_SIZE,
    directoryPath: workspace,
    currentTotalSize: 0,
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
