/**
 * Wraps an asynchronous function to measure its execution time.
 * @returns A new function that, when called, executes the original async function and logs its performance.
 * @example
 *
 * // Assume getDirectoryMd5Hash is an async function that computes MD5 hash of a directory
 * const wrappedGetDirectoryMd5Hash = measurePerformance(
 *   getDirectoryMd5Hash,
 *   'getDirectoryMd5Hash'
 * );
 *
 * // Example usage:
 * const directoryPath = '/tmp/2501-workspace';
 * wrappedGetDirectoryMd5Hash({
 *   directoryPath,
 *   ignorePatterns: IGNORED_FILE_PATTERNS,
 * })
 *   .then(({ md5 }) => {
 *     console.log(`MD5 hash of the directory: ${md5}`);
 *   })
 *   .catch((err) => console.error(err));
 */
export function measurePerformance<T>(
  asyncFn: (...args: any[]) => Promise<T>,
  fnName?: string
): (...args: Parameters<typeof asyncFn>) => Promise<T> {
  return async (...args: Parameters<typeof asyncFn>): Promise<T> => {
    const startTime = performance.now(); // Start the timer
    try {
      const result = await asyncFn(...args); // Execute the original function
      const endTime = performance.now(); // Stop the timer
      const duration = endTime - startTime; // Calculate the duration
      const dureationSecondsOrMs =
        duration < 1000
          ? `${duration.toFixed(2)}ms`
          : `${(duration / 1000).toFixed(2)}s`;
      console.log(
        `${fnName || asyncFn.name} executed in: ${dureationSecondsOrMs}`
      );
      return result; // Return the result of the original function
    } catch (error) {
      const endTime = performance.now(); // Stop the timer on error
      const duration = endTime - startTime; // Calculate the duration
      const dureationSecondsOrMs =
        duration < 1000
          ? `${duration.toFixed(2)}ms`
          : `${(duration / 1000).toFixed(2)}s`;
      console.log(
        `${fnName || asyncFn.name} failed after: ${dureationSecondsOrMs}`
      );
      throw error; // Rethrow the error after logging
    }
  };
}
