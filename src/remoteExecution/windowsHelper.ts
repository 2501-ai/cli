/**
 * Sanitize command output for safe JSON embedding while preserving readability.
 * - Normalizes Windows line endings (CRLF → LF)
 * - Keeps meaningful whitespace (\n, \t)
 * - Removes truly unwanted control chars (null, bell, escape, etc.)
 */
export function sanitizeWindowsOutput(output: string): string {
  return output
    .replace(/\r\n/g, '\n') // Normalize CRLF to LF
    .replace(/\r/g, '\n') // Standalone CR to LF
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ''); // Remove junk, keep \t (0x09) and \n (0x0A)
}

/**
 * Helper function to check if a Windows command was found.
 */
export function isCommandNotFound(output: string): boolean {
  const lowerOutput = output.toLowerCase();
  const notFoundIndicators = [
    'not recognized as an internal or external command',
    'is not recognized',
    'command not found',
    'was not found',
    'could not find',
  ];

  return notFoundIndicators.some((indicator) =>
    lowerOutput.includes(indicator)
  );
}
