/**
 * Context Builder - Simple context storage
 */
import { TelemetryContext } from './types';

// Stored context
let userContext: TelemetryContext = {};
let agentId: string | undefined;
let taskId: string | undefined;

/**
 * Update user context from agent data
 */
export const updateUserContext = (agentData: any): void => {
  userContext = {
    tenantId: agentData?.tenantId || agentData?.tenant_id,
    orgId:
      agentData?.organizationId ||
      agentData?.organization_id ||
      agentData?.orgId,
    userId: agentData?.userId || agentData?.user_id,
    requestId: agentData?.requestId,
  };
};

/**
 * Update agent/command context
 */
export const updateContext = (context: {
  agentId?: string;
  taskId?: string;
  workspacePath?: string;
}): void => {
  if (context.agentId) agentId = context.agentId;
  if (context.taskId) taskId = context.taskId;
};

/**
 * Get current context for telemetry
 */
export const getContext = (): TelemetryContext => {
  return userContext;
};

/**
 * Get current command
 */
export const getCurrentCommand = (): string => {
  return process.argv.slice(2).join(' ') || 'unknown';
};

/**
 * Get agent ID
 */
export const getAgentId = (): string | undefined => agentId;

/**
 * Get task ID
 */
export const getTaskId = (): string | undefined => taskId;

/**
 * Clear all context
 */
export const clearContext = (): void => {
  userContext = {};
  agentId = undefined;
  taskId = undefined;
};
