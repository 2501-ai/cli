/**
 * Telemetry Types - Matches API Schema
 */

export type EventType = 'info' | 'error' | 'debug' | 'warn';

export interface TelemetryEvent {
  data?: Record<string, any>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  metadata?: {
    command?: string;
    log_type?: 'error' | 'info';
  };
}

export interface TelemetryContext {
  tenantId?: string;
  orgId?: string;
  hostId?: string;
  agentId?: string;
  taskId?: string;
}

export interface TelemetryPayload {
  eventType: EventType;
  events: TelemetryEvent[];
  context?: TelemetryContext;
}
