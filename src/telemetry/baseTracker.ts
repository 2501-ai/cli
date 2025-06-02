import { v4 as uuidv4 } from 'uuid';
import { ConfigManager } from '../managers/configManager';
import Logger from '../utils/logger';
import {
  BaseTelemetryEvent,
  TelemetryConfig,
  TelemetryContext,
  TelemetryEventType,
} from './types';
import axios from 'axios';

/**
 * Base Telemetry Class
 *
 * Provides common telemetry functionality that can be extended by specific trackers.
 * Follows SOLID principles - each tracker has a single responsibility.
 */
export abstract class BaseTelemetry<TEvent extends BaseTelemetryEvent> {
  protected sessionId: string;
  protected events: TEvent[] = [];
  protected config: TelemetryConfig;
  private flushTimer?: NodeJS.Timeout;

  // Simple base context - set once
  protected agentId?: string;
  protected taskId?: string;
  protected workspacePath?: string;
  protected command?: string;

  constructor(
    protected eventType: TelemetryEventType,
    config?: Partial<TelemetryConfig>
  ) {
    this.sessionId = uuidv4();
    this.config = {
      batchSize: 5,
      flushInterval: 30000, // 30 seconds
      ...config,
    };
    this.startFlushTimer();
  }

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

    Logger.debug(`${this.eventType} context updated:`, context);
  }

  /**
   * Update task ID
   */
  setTaskId(taskId: string): void {
    this.taskId = taskId;
  }

  /**
   * Track an event - to be implemented by subclasses
   */
  protected abstract createEvent(
    data: any,
    context?: Partial<TelemetryContext>
  ): TEvent;

  /**
   * Core tracking method
   */
  protected async track(
    data: any,
    context?: Partial<TelemetryContext>
  ): Promise<void> {
    if (!this.isEnabled()) {
      Logger.debug(`${this.eventType} tracking disabled, skipping`);
      return;
    }

    try {
      const event = this.createEvent(data, context);
      this.events.push(event);

      Logger.debug(`${this.eventType} event tracked: ${event.id}`);

      // Auto-flush if batch size reached
      if (this.events.length >= this.config.batchSize) {
        await this.flush();
      }
    } catch (error) {
      Logger.error(`Failed to track ${this.eventType} event:`, error);
    }
  }

  /**
   * Flush events to backend
   */
  async flush(): Promise<void> {
    if (this.events.length === 0) return;

    const eventsToSend = [...this.events];
    this.events = []; // Clear immediately

    try {
      await this.sendEvents(eventsToSend);
      Logger.debug(`Flushed ${eventsToSend.length} ${this.eventType} events`);
    } catch (error) {
      Logger.error(`Failed to send ${this.eventType} events:`, error);
      // Don't re-add events to avoid infinite loops
    }
  }

  /**
   * Send events to backend - can be overridden by subclasses
   */
  protected async sendEvents(events: TEvent[]): Promise<void> {
    if (process.env.TFZO_NODE_ENV === 'dev') {
      this.logEventsInDev(events);
      return;
    }

    await this.sendToEndpoint(events);
  }

  /**
   * Log events in development mode
   */
  protected logEventsInDev(events: TEvent[]): void {
    console.log(`📊 ${this.eventType.toUpperCase()} Telemetry (dev mode):`);
    const context = this.buildContext();
    console.log('  Agent: ', context.agentId);
    console.log('  Task: ', context.taskId);
    console.log('  Workspace: ', context.workspacePath);
    console.log('  Command: ', context.command);
    console.log('  Platform: ', context.platform);
    console.log('  CLI Version: ', context.cliVersion);
    console.log('  --- Events ---');

    events.forEach((event) => {
      console.log(`  ID: ${event.id}`);
      console.log(`  Type: ${event.type}`);
      console.log(`  Timestamp: ${new Date(event.timestamp).toISOString()}`);

      if ('context' in event) {
        console.log(`  Context: ${JSON.stringify(event.context)}`);
      }
      console.log('  ---');
    });
  }

  /**
   * Send to HTTP endpoint
   */
  private async sendToEndpoint(events: TEvent[]): Promise<void> {
    const response = await axios.post(
      `/telemetry`,
      {
        sessionId: this.sessionId,
        eventType: this.eventType,
        context: this.buildContext(),
        events,
      },
      { timeout: 3_000 }
    );

    if (response.status !== 200) {
      throw new Error(`Telemetry upload failed: ${response.status}`);
    }
  }

  /**
   * Build common context
   */
  protected buildContext(): TelemetryContext {
    return {
      // Base context (set once)
      agentId: this.agentId,
      taskId: this.taskId,
      workspacePath: this.workspacePath,
      command: this.getCurrentCommand(),

      // System context
      nodeVersion: process.version,
      platform: process.platform,
      cliVersion: this.getCliVersion(),
    };
  }

  /**
   * Check if telemetry is enabled
   */
  isEnabled(): boolean {
    return ConfigManager.instance.get('telemetry_enabled');
  }

  /**
   * Start automatic flush timer
   */
  private startFlushTimer(): void {
    if (this.config.flushInterval > 0) {
      this.flushTimer = setInterval(() => {
        this.flush().catch((error) => {
          Logger.debug(`Auto-flush failed for ${this.eventType}:`, error);
        });
      }, this.config.flushInterval);
    }
  }

  /**
   * Get current command from process args
   */
  private getCurrentCommand(): string {
    return process.argv.slice(2).join(' ') || 'unknown';
  }

  /**
   * Get CLI version
   */
  protected getCliVersion(): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require('../../package.json').version;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    await this.flush();
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get current config
   */
  getConfig(): TelemetryConfig {
    return { ...this.config };
  }
}
