/**
 * Context Builder - Simple context storage
 */
import { TelemetryContext } from './types';

// Stored context
let telemetryContext: TelemetryContext = {};

/**
 * Update user context from agent data
 */
export const updateTelemetryContext = ({
  orgId,
  tenantId,
  hostId,
  agentId,
  taskId,
}: TelemetryContext): void => {
  telemetryContext = {
    tenantId: tenantId || telemetryContext.tenantId,
    orgId: orgId || telemetryContext.orgId,
    hostId: hostId || telemetryContext.hostId,
    agentId: agentId || telemetryContext.agentId,
    taskId: taskId || telemetryContext.taskId,
  };
};

/**
 * Get current context for telemetry
 */
export const getContext = (): TelemetryContext => {
  return telemetryContext;
};

/**
 * Get current command
 */
export const getCurrentCommand = (): string => {
  return process.argv.slice(2).join(' ');
};
