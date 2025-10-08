/**
 * Error Tracker
 */
import axios from 'axios';
import { sendTelemetry } from '../helpers/api';
import { getContext, getCurrentCommand } from './contextBuilder';

/**
 * Track an error
 */
export const trackError = async (
  error: Error,
  metadata?: Record<string, any>
): Promise<void> => {
  try {
    let code: string | undefined;
    const stack = error.stack;

    // Extract code from Axios errors
    if (axios.isAxiosError(error)) {
      code = error.code || `HTTP_${error.response?.status}`;
    }

    await sendTelemetry({
      eventType: 'error',
      events: [
        {
          error: {
            message: error.message,
            stack,
            code,
          },
          metadata: {
            command: getCurrentCommand(),
            log_type: 'error',
            ...metadata,
          },
        },
      ],
      context: getContext(),
    });
  } catch (err) {
    // Silent fail
    if (process.env.TFZO_DEBUG === 'true') {
      console.error('[ErrorTracker] Failed:', err);
    }
  }
};

// Legacy compatibility
export const errorTracker = {
  trackError: (error: Error, ctx?: { metadata?: Record<string, any> }) =>
    trackError(error, ctx?.metadata),
  isEnabled: () => true,
  updateContext: () => {}, // No-op, context managed in contextBuilder
};
