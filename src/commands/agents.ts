import { terminal } from 'terminal-kit';

import {
  flushAgents,
  listAgents,
  listAgentsFromWorkspace,
} from '../utils/conf';
import { resolveWorkspacePath } from '../helpers/workspace';

export const agentsCommand = async (options: {
  all?: boolean;
  flush?: boolean;
  workspace?: string;
}): Promise<number> => {
  const workspaceUrl = resolveWorkspacePath({ workspace: options.workspace });

  if (options.flush) {
    await flushAgents(workspaceUrl, options.all);
    terminal('All agents have been flushed from the configuration.\n');
    return 0;
  }

  let agents;
  if (options.all) {
    agents = listAgents();
  } else {
    agents = listAgentsFromWorkspace(workspaceUrl);
  }

  if (agents.length > 0) {
    terminal.table(
      [
        ['Name', 'ID', 'Configuration', 'Workspace', 'Remote Exec'],
        ...agents.map((agent) => [
          agent.name.substring(0, 10),
          agent.id,
          agent.configuration,
          agent.workspace,
          agent.remote_exec?.enabled
            ? `${agent.remote_exec.user}@${agent.remote_exec.target}:${agent.remote_exec.port}`
            : 'Disabled',
        ]),
      ],
      {
        hasBorder: true,
        contentHasMarkup: true,
        borderChars: 'lightRounded',
        borderAttr: { color: 'blue' },
        textAttr: { bgColor: 'default' },
        firstRowTextAttr: { bgColor: 'blue' },
        width: 120,
        fit: true,
      }
    );
  } else {
    terminal('No agents found.\n');
  }
  return 0;
};
