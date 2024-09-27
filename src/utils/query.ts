/**
 * Retry Request
 * @param req - Request
 * @param params - Parameters
 * @param maxRetries - Max number of Retries
 * @param delay - Delay in Milliseconds
 */
export const retryRequest = async <T, A>(
  req: (...args: A[]) => Promise<T>,
  params: Parameters<typeof req>,
  maxRetries: number,
  delay: number
): Promise<T> => {
  try {
    return await req();
  } catch (e) {
    maxRetries--;
    if (maxRetries <= 0) {
      throw e;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
    return await retryRequest(req, params, maxRetries, delay);
  }
};
