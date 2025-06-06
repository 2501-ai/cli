import { v4 as uuidv4 } from 'uuid';
import Logger from '../utils/logger';
import { ErrorTelemetryEvent, TelemetryContext } from './types';
import axios from 'axios';

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
