import archiver from 'archiver';
import { createReadStream, createWriteStream } from 'fs';
import { Readable } from 'stream';

import { isTextExtended, toReadableSize } from './files';
import Logger from './logger';

interface ZipOptions {
  outputPath: string;
  maxFileSize?: number;
  maxTotalSize?: number;
}

interface FileEntry {
  path: string;
  size: number;
  relativePath: string;
}

interface ProcessedFile {
  content: Parameters<archiver.Archiver['append']>[0];
  options: Parameters<archiver.Archiver['append']>[1];
}

export class ZipUtility {
  private static readonly SMALL_FILE_THRESHOLD = 1024 * 1024; // 1MB
  private static readonly MEDIUM_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB

  /**
   * Determines if file should be stored without compression
   */
  private shouldStore(file: FileEntry): boolean {
    // Store without compression if:
    // 1. Not a text file
    // 2. Large file (> 10MB)
    return (
      !isTextExtended(file.path) || file.size > ZipUtility.MEDIUM_FILE_THRESHOLD
    );
  }

  /**
   * Creates an omitted file entry with a message
   */
  private createOmittedEntry(
    relativePath: string,
    message: string
  ): ProcessedFile {
    return {
      content: message,
      options: {
        name: relativePath,
        store: true,
      },
    };
  }

  /**
   * Process a single file entry
   * Pure function that determines how a file should be handled
   */
  private processFileEntry(
    file: FileEntry,
    currentTotalSize: number,
    options: ZipOptions
  ): ProcessedFile {
    // Size limit checks
    if (options.maxFileSize && file.size > options.maxFileSize) {
      return this.createOmittedEntry(
        file.relativePath,
        `Content omitted. Reason: File too large. File size: ${toReadableSize(
          file.size
        )}. Max file size: ${toReadableSize(options.maxFileSize)}`
      );
    }

    if (
      options.maxTotalSize &&
      currentTotalSize + file.size > options.maxTotalSize
    ) {
      return this.createOmittedEntry(
        file.relativePath,
        `Content omitted. Reason: Total size would exceed limit. File size: ${toReadableSize(
          file.size
        )}. Current total: ${toReadableSize(currentTotalSize)}. Max total: ${toReadableSize(
          options.maxTotalSize
        )}`
      );
    }

    // Text file check
    if (!isTextExtended(file.path)) {
      return this.createOmittedEntry(
        file.relativePath,
        'Content omitted. Reason: Not a text file.'
      );
    }

    // Process valid text file
    Logger.debug(
      `Processing ${file.relativePath} with compression level ${this.shouldStore(file) ? 'stored' : 'compressed'} (${toReadableSize(
        file.size
      )})`
    );

    return {
      content: createReadStream(file.path),
      options: {
        name: file.relativePath,
        store: this.shouldStore(file),
      },
    };
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
        zlib: { level: 6 }, // Default compression level
      });
      let currentTotalSize = 0;
      const activeStreams = new Set<Readable>();

      // Cleanup function for error cases
      const cleanup = () => {
        activeStreams.forEach((stream) => stream.destroy());
        activeStreams.clear();
        output.destroy();
        archive.destroy();
      };

      // Handle events
      output.on('error', (err) => {
        cleanup();
        reject(err);
      });

      archive.on('error', (err) => {
        cleanup();
        reject(err);
      });

      archive.on('warning', (err) => {
        if (err.code === 'ENOENT') {
          Logger.warn('ZIP warning:', err);
        } else {
          cleanup();
          reject(err);
        }
      });

      output.on('close', () => {
        Logger.debug(
          `ZIP created: ${options.outputPath} - ${archive.pointer()} bytes`
        );
        resolve(options.outputPath);
      });

      archive.pipe(output);

      // Process files
      for (const file of files) {
        const processed = this.processFileEntry(
          file,
          currentTotalSize,
          options
        );

        if (processed.content instanceof Readable) {
          activeStreams.add(processed.content);
          processed.content.on('end', () => {
            activeStreams.delete(processed.content as Readable);
          });
          currentTotalSize += file.size;
        }

        archive.append(processed.content, processed.options);
      }

      archive.finalize();
    });
  }
}

// Export singleton instance
export const zipUtility = new ZipUtility();
