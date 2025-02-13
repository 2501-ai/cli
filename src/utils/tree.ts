/**
 * Return a plain text list with forward slashes, one file per line.
 * This appears to be the optimal format for an LLM agent to process.
 */
export function generateTree(fileList: string[]): string {
  return fileList.join('\n');
}
