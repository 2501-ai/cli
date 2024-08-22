import { UpdateInstruction } from './types';

export class FileUpdater {
  private fileContent: string;
  private updates: UpdateInstruction[];

  private fileLines: string[] = [];
  private min_offset: number = Infinity;
  private total_offset: number = 0;

  constructor(fileContent: string, updates: UpdateInstruction[]) {
    this.fileContent = fileContent;
    this.updates = updates;

    this.fileLines = this.fileContent.split('\n');
  }

  private isOffsetted(update: UpdateInstruction) {
    return update.lineStart && update.lineStart > this.min_offset;
  }

  private adjustUpdate(update: UpdateInstruction) {
    const lineStart = this.isOffsetted(update)
      ? Math.max(update.lineStart - 1, 0) + this.total_offset
      : Math.max(update.lineStart - 1, 0);

    return {
      content: update.content,
      lineStart,
      lineEnd: update.lineEnd
        ? this.isOffsetted(update)
          ? update.lineEnd - 1 + this.total_offset
          : update.lineEnd - 1
        : lineStart,
    };
  }

  execute(): string {
    this.min_offset = Infinity;
    this.total_offset = 0;

    for (const update of this.updates.sort(
      (a, b) => a.lineStart - b.lineStart
    )) {
      const { content, lineStart, lineEnd } = this.adjustUpdate(update);

      if (content && content.length > 0) {
        this.fileLines.splice(
          lineStart,
          lineEnd - lineStart === 0 ? 0 : lineEnd - lineStart + 1,
          ...content.split('\n')
        );
        this.total_offset += content.split('\n').length;
      } else {
        this.fileLines.splice(lineStart, lineEnd - lineStart);
        this.total_offset -= lineEnd - lineStart;
      }
      this.min_offset = Math.min(this.min_offset, lineStart);
    }

    return this.fileLines.join('\n');
  }
}
