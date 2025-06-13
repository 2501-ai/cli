import { v4 as uuidv4 } from 'uuid';
import Logger from '../utils/logger';
import { ErrorTelemetryEvent, TelemetryContext } from './types';
import axios, { AxiosError } from 'axios';

/**
 * Safely stringifies an object, handling circular references
 */
function safeStringify(obj: any): any {
  const seen = new WeakSet();
  return JSON.parse(
    JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular Reference]';
        }
        seen.add(value);
      }
      // Handle non-serializable types
      if (typeof value === 'function') {
        return '[Function]';
      }
      if (value instanceof Error) {
        return {
          message: value.message,
          name: value.name,
          stack: value.stack,
        };
      }
      return value;
    })
  );
}

/**
 * Sanitizes an error object to remove circular references and non-serializable properties
 */
function sanitizeError(error: Error | AxiosError): {
  message: string;
  stack?: string;
  name: string;
} {
  const baseError = {
    message: error.message,
    name: error.name,
    stack: error.stack,
  };

  // For Axios errors, enhance the error message with additional context
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    const details = [];

    if (axiosError.response?.status) {
      details.push(`Status: ${axiosError.response.status}`);
    }
    if (axiosError.code) {
      details.push(`Code: ${axiosError.code}`);
    }

    // Safely include response data in the message
    if (axiosError.response?.data) {
      try {
        const dataStr = JSON.stringify(axiosError.response.data);
        details.push(`Response: ${dataStr}`);
      } catch (e) {
        details.push('Response: [Circular or non-serializable response data]');
      }
    }

    // Enhance the message with axios-specific details
    if (details.length > 0) {
      baseError.message = `${baseError.message} (${details.join(', ')})`;
    }
  }

  return baseError;
}

/**
 * Sanitizes the context object to ensure it's serializable
 */
function sanitizeContext(context: any): any {
  try {
    return safeStringify(context);
  } catch (e) {
    Logger.debug('Error sanitizing context:', e);
    return {
      error: 'Context contained non-serializable data',
      sanitized: false,
    };
  }
}

/**
 * ErrorTracker
 */
class ErrorTracker {
  private sessionId = uuidv4();

  private agentId?: string;
  private taskId?: string;
  private workspacePath?: string;
  private command?: string;

  constructor() {}

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
      await this.sendToEndpoint([event]);
      Logger.debug(`Error event sent: ${event.id}`);
    } catch (err) {
      Logger.error('Failed to send error event:', err);
    }
  }

  private createEvent(
    error: Error,
    metadata?: Record<string, any>
  ): ErrorTelemetryEvent {
    return {
      id: uuidv4(),
      type: 'error',
      timestamp: Date.now(),
      sessionId: this.sessionId,
      error: sanitizeError(error),
      context: {
        ...this.buildContext(),
        metadata,
      },
    };
  }

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

  private getCurrentCommand(): string {
    return process.argv.slice(2).join(' ') || 'unknown';
  }

  private getCliVersion(): string {
    try {
      return require('../../package.json').version;
    } catch {
      return 'unknown';
    }
  }

  isEnabled(): boolean {
    return true;
  }

  private async sendToEndpoint(events: ErrorTelemetryEvent[]): Promise<void> {
    try {
      const sanitizedEvents = events.map((event) => ({
        ...event,
        error: sanitizeError(event.error as Error),
        context: sanitizeContext(event.context),
      }));

      const response = await axios.post(
        `/telemetry`,
        {
          sessionId: this.sessionId,
          eventType: 'error',
          context: sanitizeContext(this.buildContext()),
          events: sanitizedEvents,
        },
        { timeout: 3_000 }
      );

      if (response.status !== 200 && response.status !== 201) {
        throw new Error(`Telemetry upload failed: ${response.status}`);
      }
    } catch (error) {
      // Log the error but don't rethrow to prevent infinite loops
      Logger.debug('Failed to send telemetry:', error);
    }
  }

  getSessionId(): string {
    return this.sessionId;
  }
}

export const errorTracker = new ErrorTracker();

export function trackError(
  error: Error,
  context?: { metadata?: Record<string, any> }
): void {
  errorTracker.trackError(error, context).catch(() => {});
}
