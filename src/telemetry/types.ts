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
    feature?: string;
    endpoint?: string;
  };
}

export interface TelemetryContext {
  tenantId?: string;
  orgId?: string;
  userId?: string;
  requestId?: string;
}

export interface TelemetryPayload {
  sessionId: string;
  eventType: EventType;
  events: TelemetryEvent[];
  context?: TelemetryContext;
}
