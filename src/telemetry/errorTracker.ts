import { v4 as uuidv4 } from 'uuid';
import Logger from '../utils/logger';
import { ErrorTelemetryEvent, TelemetryContext } from './types';
import axios from 'axios';

/**
 * ErrorTracker
 * Handles batching, context, flush, and HTTP logic for error telemetry events.
 */
class ErrorTracker {
  /** Unique session identifier for telemetry events */
  private sessionId = uuidv4();
  /** Batched error events */
  private events: ErrorTelemetryEvent[] = [];
  /** Number of events before auto-flush */
  private batchSize = 3;
  /** Interval (ms) for auto-flush */
  private flushInterval = 10000; // 10 seconds
  private flushTimer?: NodeJS.Timeout;

  // Context fields for telemetry
  private agentId?: string;
  private taskId?: string;
  private workspacePath?: string;
  private command?: string;

  /**
   * Initializes the error tracker and starts the flush timer.
   */
  constructor() {
    this.startFlushTimer();
  }

  /**
   * Update the context for future error events.
   * @param context Partial context to update (agentId, taskId, workspacePath, command)
   */
  updateContext(context: {
    agentId?: string;
    taskId?: string;
    workspacePath?: string;
    command?: string;
  }): void {
    this.workspacePath = context.workspacePath || this.workspacePath;
    this.command = context.command || this.command;
    this.agentId = context.agentId || this.agentId;
    this.taskId = context.taskId || this.taskId;
    Logger.debug(`error context updated:`, context);
  }

  /**
   * Track an error event. Adds to batch and flushes if needed.
   * @param error The error to track
   * @param context Optional metadata for the event
   */
  async trackError(
    error: Error,
    context?: { metadata?: Record<string, any> }
  ): Promise<void> {
    if (!this.isEnabled()) {
      Logger.debug('Error tracking disabled, skipping');
      return;
    }
    try {
      const event = this.createEvent(error, context?.metadata);
      this.events.push(event);
      Logger.debug(`Error event tracked: ${event.id}`);
      if (this.events.length >= this.batchSize) {
        await this.flush();
      }
    } catch (err) {
      Logger.error('Failed to track error event:', err);
    }
  }

  /**
   * Create an error telemetry event with current context.
   * @param error The error object
   * @param metadata Optional metadata
   * @returns ErrorTelemetryEvent
   */
  private createEvent(
    error: Error,
    metadata?: Record<string, any>
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
      context: {
        ...this.buildContext(),
        metadata,
      },
    };
  }

  /**
   * Build the current telemetry context for events.
   * @returns TelemetryContext
   */
  private buildContext(): TelemetryContext {
    return {
      agentId: this.agentId,
      taskId: this.taskId,
      workspacePath: this.workspacePath,
      command: this.getCurrentCommand(),
      nodeVersion: process.version,
      platform: process.platform,
      cliVersion: this.getCliVersion(),
    };
  }

  /**
   * Get the current CLI command as a string.
   * @returns Command string
   */
  private getCurrentCommand(): string {
    return process.argv.slice(2).join(' ') || 'unknown';
  }

  /**
   * Get the CLI version from package.json.
   * @returns CLI version string
   */
  private getCliVersion(): string {
    try {
      return require('../../package.json').version;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Check if error telemetry is enabled.
   * @returns Always true (errors are always tracked)
   */
  isEnabled(): boolean {
    return true;
  }

  /**
   * Start the automatic flush timer for batching.
   */
  private startFlushTimer(): void {
    if (this.flushInterval > 0) {
      this.flushTimer = setInterval(() => {
        this.flush().catch((error) => {
          Logger.debug('Auto-flush failed for error:', error);
        });
      }, this.flushInterval);
    }
  }

  /**
   * Flush all batched error events to the backend.
   */
  async flush(): Promise<void> {
    if (this.events.length === 0) return;
    const eventsToSend = [...this.events];
    this.events = [];
    try {
      await this.sendEvents(eventsToSend);
      Logger.debug(`Flushed ${eventsToSend.length} error events`);
    } catch (error) {
      Logger.error('Failed to send error events:', error);
    }
  }

  /**
   * Send error events to the backend (logs in dev, sends in prod).
   * @param events Array of error events
   */
  private async sendEvents(events: ErrorTelemetryEvent[]): Promise<void> {
    if (process.env.TFZO_NODE_ENV === 'dev') {
      // Dev mode: log events to debug output
      Logger.debug('Error telemetry events (dev mode):', events);
    }
    await this.sendToEndpoint(events);
  }

  /**
   * Send error events to the telemetry HTTP endpoint.
   * @param events Array of error events
   * @throws If the HTTP request fails
   */
  private async sendToEndpoint(events: ErrorTelemetryEvent[]): Promise<void> {
    const response = await axios.post(
      `/telemetry`,
      {
        sessionId: this.sessionId,
        eventType: 'error',
        context: this.buildContext(),
        events,
      },
      { timeout: 3_000 }
    );
    if (response.status !== 200 && response.status !== 201) {
      throw new Error(`Telemetry upload failed: ${response.status}`);
    }
  }

  /**
   * Cleanup resources and flush remaining events.
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    await this.flush();
  }

  /**
   * Get the current session ID for telemetry.
   * @returns Session ID string
   */
  getSessionId(): string {
    return this.sessionId;
  }
}

/**
 * Singleton instance of ErrorTracker for global use.
 */
export const errorTracker = new ErrorTracker();

/**
 * Helper function to track an error event using the global errorTracker.
 * @param error The error to track
 * @param context Optional metadata for the event
 */
export function trackError(
  error: Error,
  context?: { metadata?: Record<string, any> }
): void {
  errorTracker.trackError(error, context).catch(() => {});
}
