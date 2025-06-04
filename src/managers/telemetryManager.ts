/**
 * Telemetry Manager - coordinates all trackers
 */
import { errorTracker } from '../telemetry/errorTracker';

export class TelemetryManager {
  private static _instance: TelemetryManager;

  static get instance(): TelemetryManager {
    if (!TelemetryManager._instance) {
      TelemetryManager._instance = new TelemetryManager();
    }
    return TelemetryManager._instance;
  }

  updateContext(context: {
    workspacePath?: string;
    command?: string;
    agentId?: string;
    taskId?: string;
  }): void {
    errorTracker.updateContext(context);
  }

  /**
   * Shutdown all trackers gracefully
   */
  async shutdown(): Promise<void> {
    await Promise.all([errorTracker.shutdown()]);
  }

  /**
   * Get status of all trackers
   */
  getStatus(): Record<string, boolean> {
    return {
      errors: errorTracker.isEnabled(),
    };
  }
}
