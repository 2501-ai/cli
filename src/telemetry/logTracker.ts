/**
 * Log Tracker
 */
import { EventType } from './types';
import { sendTelemetry } from '../helpers/api';
import { getContext, getCurrentCommand } from './contextBuilder';
import Logger from '../utils/logger';
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
          log_type: 'info',
          ...metadata,
        },
      },
    ],
    context: getContext(),
  }).catch((error) => {
    Logger.error('Error sending telemetry:', error);
  });
};
