/**
 * Telemetry Module
 *
 * Centralized telemetry system for 2501 CLI
 */
export { errorTracker, trackError } from './errorTracker';
export * from './types';

// Re-export commonly used functions
export { trackError as reportError } from './errorTracker';
