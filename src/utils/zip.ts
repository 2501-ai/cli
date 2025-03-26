import { createWriteStream, createReadStream } from 'fs';
import archiver from 'archiver';
import path from 'path';

import Logger from './logger';
import { INCLUDED_FILE_EXTENSIONS } from '../constants';
import { isTextExtended } from './files';

interface ZipOptions {
  outputPath: string;
  maxFileSize?: number; // in bytes
  maxTotalSize?: number; // in bytes
}

interface FileEntry {
  path: string;
  size: number;
  relativePath: string;
}

export class ZipUtility {
  private static readonly SMALL_FILE_THRESHOLD = 1024 * 1024; // 1MB
  private static readonly MEDIUM_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB

  /**
   * Determines optimal compression level based on file type and size
   */
  private getCompressionLevel(filePath: string, size: number): number {
    // Already compressed or binary files
    if (!this.isCompressibleFile(filePath)) {
      return 0;
    }

    // Size-based compression strategy
    if (size > ZipUtility.MEDIUM_FILE_THRESHOLD) {
      return 1; // Minimal compression for large files
    } else if (size > ZipUtility.SMALL_FILE_THRESHOLD) {
      return 6; // Balanced compression for medium files
    }
    return 9; // Maximum compression for small files
  }

  /**
   * Checks if file should be compressed based on extension and content
   */
  private isCompressibleFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();

    // Known text file extensions
    if (INCLUDED_FILE_EXTENSIONS.includes(ext)) {
      return true;
    }

    // Check if file is text-based
    return isTextExtended(filePath) ?? false;
  }

  /**
   * Creates a ZIP file from the given files
   */
  public async createZip(
    files: FileEntry[],
    options: ZipOptions
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(options.outputPath);
      const archive = archiver('zip', {
        zlib: { level: 6 }, // Default compression
      });

      output.on('close', () => {
        Logger.debug(
          `ZIP created: ${options.outputPath} - ${archive.pointer()} bytes`
        );
        resolve(options.outputPath);
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.on('warning', (err) => {
        if (err.code === 'ENOENT') {
          Logger.error('ZIP warning:', err);
        } else {
          reject(err);
        }
      });

      archive.pipe(output);

      let currentTotalSize = 0;
      // Process files with appropriate compression levels
      files.forEach((file) => {
        // Check file size limit
        if (options.maxFileSize && file.size > options.maxFileSize) {
          Logger.debug(`File size exceeds limit:`, {
            relativePath: file.relativePath,
            size: file.size,
            limit: options.maxFileSize,
          });
          archive.append('Content omitted. Reason: File too large.', {
            name: file.relativePath,
            store: true,
          });
          return;
        }

        // Check total size limit
        if (
          options.maxTotalSize &&
          currentTotalSize + file.size > options.maxTotalSize
        ) {
          Logger.debug(`Total size would exceed limit:`, {
            relativePath: file.relativePath,
            currentTotal: currentTotalSize,
            wouldAdd: file.size,
            limit: options.maxTotalSize,
          });
          archive.append('Content omitted. Reason: Total size limit reached.', {
            name: file.relativePath,
            store: true,
          });
          return;
        }

        // Check if file is text
        if (!isTextExtended(file.path)) {
          Logger.debug(`Content omitted. Reason: Not a text file.`, {
            relativePath: file.relativePath,
            path: file.path,
            size: file.size,
          });
          archive.append('Content omitted. Reason: Not a text file.', {
            name: file.relativePath,
            store: true,
          });
          return;
        }

        // Process valid file
        const compressionLevel = this.getCompressionLevel(file.path, file.size);
        const fileStream = createReadStream(file.path);

        archive.append(fileStream, {
          name: file.relativePath,
          store: compressionLevel === 0, // Store without compression if level is 0
        });

        currentTotalSize += file.size;
      });

      archive.finalize();
    });
  }
}

// Export singleton instance
export const zipUtility = new ZipUtility();
