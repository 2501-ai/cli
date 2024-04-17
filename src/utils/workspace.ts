import fs from 'fs';
import path from 'path';
import axios from 'axios';
import PDFDocument from 'pdfkit';
import { FormData } from 'formdata-node';

import { isText } from 'istextorbinary';

axios.defaults.baseURL = 'http://localhost:1337/api/v1';
axios.defaults.timeout = 8000;

const ignored = [
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
  ignoreFiles: string[] = ignored
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

  const ignorePatterns = ignored.map(
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
    .then(() => {
      //console.log('Agent : Workspace files unified.');
    })
    .catch((err) => {
      console.error(
        'Agent : An error occurred while generating the PDF:' + err
      );
    });

  const pdfs = await getPDFsFromWorkspace(workspace);

  const output = [outputFilePath].concat(pdfs).map((pdf) => {
    return {
      path: pdf,
      data: fs.readFileSync(pdf),
    };
  });

  return output;
}

export async function getFileFromWorkspace(path: string) {
  if (!fs.existsSync(path)) return 'NO FILE YET';
  const content = fs.readFileSync(path, { encoding: 'utf-8' });
  return Buffer.from(content).toString();
}

export async function syncWorkspace(workspace: string) {
  const files: { path: string; data: Buffer }[] = await getContextFromWorkspace(
    workspace
  );
  if (!files.length) {
    return;
  }
  const data = new FormData();
  for (let i = 0; i < files.length; i++) {
    const name = files[i].path.split('/').pop();
    data.set('file' + i, new Blob([files[i].data]), name);
  }

  const response = await axios.post('/files', data, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  const form_files = response.data.map((file: { id: string }) => file.id);
  return { data, files: form_files };
}
