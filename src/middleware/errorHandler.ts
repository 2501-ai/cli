import { sendErrorToEngine } from '../helpers/api';
import { ConfigManager } from '../managers/configManager';
import { AgentConfig } from '../utils/types';

export function withErrorHandler<T extends (...args: any[]) => Promise<any>>(
  fn: T
) {
  return async (...args: Parameters<T>) => {
    try {
      await fn(...args);
    } catch (err) {
      const agentConfig: AgentConfig[] = ConfigManager.instance.get('agents');

      // Todo : pas ouf
      const agent =
        agentConfig && agentConfig.length > 0 ? agentConfig[0] : undefined;

      const stacktrace: string =
        err instanceof Error
          ? err.stack || 'No stack trace available'
          : 'No stack trace available';

      if (agent) {
        console.error('Agent Info:', {
          id: agent.id,
          name: agent.name,
          workspace: agent.workspace,
          engine: agent.engine,
          configuration: agent.configuration,
          capabilities: agent.capabilities,
          host_id: agent.host_id,
          key: agent.key,
        });
        await sendErrorToEngine(agent, stacktrace);
      } else {
        console.error('Agent Info: NO_AGENT_AVAILABLE');
      }

      console.error('Error:', err instanceof Error ? err.message : err);
      console.error('Stacktrace:', stacktrace);
      process.exit(1);
    }
  };
}
