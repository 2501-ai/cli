/**
 * Telemetry Types - Keep It Simple
 */

export type TelemetryEventType =
  | 'error'
  | 'command'
  | 'performance'
  | 'feature_usage'
  | 'system';

export interface BaseTelemetryEvent {
  id: string;
  type: TelemetryEventType;
  timestamp: number;
  sessionId: string;
}

export interface TelemetryContext {
  // Core AI context - set once
  agentId?: string;
  taskId?: string;
  workspacePath?: string;

  // System context
  nodeVersion: string;
  platform: string;
  cliVersion: string;

  // Per-event context
  command?: string;
  metadata?: Record<string, any>;
}

export interface ErrorTelemetryEvent extends BaseTelemetryEvent {
  type: 'error';
  error: {
    message: string;
    stack?: string;
    name: string;
  };
  context: any;
}

export type TelemetryEvent = ErrorTelemetryEvent;

export interface TelemetryConfig {
  batchSize: number;
  flushInterval: number;
}
