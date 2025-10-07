/**
 * Log Tracker
 */
import { EventType } from './types';
import { sendTelemetry } from './apiClient';
import { getContext, getCurrentCommand } from './contextBuilder';

/**
 * Track a log message
 */
export const trackLog = (
  level: EventType,
  message: string,
  metadata?: Record<string, any>
): void => {
  // Fire and forget
  sendTelemetry({
    eventType: level,
    events: [
      {
        data: { message },
        metadata: {
          command: getCurrentCommand(),
          ...metadata,
        },
      },
    ],
    context: getContext(),
  }).catch(() => {}); // Silent fail
};
