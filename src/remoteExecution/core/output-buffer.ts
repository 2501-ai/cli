export class OutputBuffer {
  private buffer = '';
  private stderrBuffer = '';
  private lastUpdateTime = Date.now();

  static from(data: string): OutputBuffer {
    const buffer = new OutputBuffer();
    buffer.append(data);
    return buffer;
  }

  append(data: string, isStderr = false): void {
    if (isStderr) {
      this.stderrBuffer += data;
    } else {
      this.buffer += data;
    }

    this.lastUpdateTime = Date.now();
  }

  getBuffer(): string {
    return this.buffer;
  }

  getStderrBuffer(): string {
    return this.stderrBuffer;
  }

  getCombinedBuffer(): string {
    return this.buffer + this.stderrBuffer;
  }

  getLastLine(): string {
    const combined = this.getCombinedBuffer();
    const lines = combined.split('\n');

    // Get the last non-empty line, or the last line if it's not empty
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() !== '' || i === lines.length - 1) {
        return lines[i];
      }
    }

    return '';
  }

  // Get buffer statistics
  getStats() {
    const combined = this.getCombinedBuffer();
    const lines = combined.split('\n');

    return {
      totalLength: combined.length,
      lineCount: lines.length,
      lastLineLength: this.getLastLine().length,
      hasContent: combined.trim().length > 0,
      timeSinceLastUpdate: Date.now() - this.lastUpdateTime,
    };
  }
}
