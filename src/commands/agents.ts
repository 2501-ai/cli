import { terminal } from 'terminal-kit';

import {
  listAgents,
  listAgentsFromWorkspace,
  flushAgents,
} from '../utils/conf';

export async function agentsCommand(options: {
  all?: boolean;
  flush?: boolean;
  workspace?: string;
}): Promise<void> {
  const workspaceUrl = options.workspace || process.cwd();

  if (options.flush) {
    await flushAgents(workspaceUrl, options.all);
    terminal('All agents have been flushed from the configuration.\n');
    return;
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
        ['Name', 'ID', 'Configuration', 'Workspace'],
        ...agents.map((agent) => [
          agent.name.substring(0, 10),
          agent.id,
          agent.configuration,
          agent.workspace,
        ]),
      ],
      {
        hasBorder: true,
        contentHasMarkup: true,
        borderChars: 'lightRounded',
        borderAttr: { color: 'blue' },
        textAttr: { bgColor: 'default' },
        firstRowTextAttr: { bgColor: 'blue' },
        width: 80,
        fit: true,
      }
    );
  } else {
    terminal('No agents found.\n');
  }
}
