import { v4 as uuidv4 } from 'uuid';
import { BaseTelemetry } from './baseTracker';
import { ErrorTelemetryEvent, TelemetryContext } from './types';

/**
 * Error Tracker
 *
 * Specialized telemetry tracker for errors and exceptions.
 * Inherits common functionality from BaseTelemetry.
 */
export class ErrorTracker extends BaseTelemetry<ErrorTelemetryEvent> {
  private static _instance: ErrorTracker;

  static get instance(): ErrorTracker {
    if (!ErrorTracker._instance) {
      ErrorTracker._instance = new ErrorTracker();
    }
    return ErrorTracker._instance;
  }

  constructor() {
    super('error', {
      batchSize: 3, // Smaller batch for errors - send quickly
      flushInterval: 10000, // 10 seconds for errors
    });
  }

  /**
   * Track an error with context
   */
  async trackError(
    error: Error,
    context?: { metadata?: Record<string, any> }
  ): Promise<void> {
    await this.track(error, context);
  }

  /**
   * Create error telemetry event
   */
  protected createEvent(
    error: Error,
    additionalContext?: Partial<TelemetryContext>
  ): ErrorTelemetryEvent {
    return {
      id: uuidv4(),
      type: 'error',
      timestamp: Date.now(),
      sessionId: this.sessionId,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      context: additionalContext,
    };
  }

  /**
   * Override default enabled state for errors - more permissive
   */
  protected getDefaultEnabled(): boolean {
    // Errors are critical - enable by default even if general telemetry is off
    return true;
  }
}

/**
 * Helper function for easy error tracking
 */
export function trackError(
  error: Error,
  context?: { metadata?: Record<string, any> }
): void {
  ErrorTracker.instance.trackError(error, context).catch(() => {});
}
