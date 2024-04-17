import { listAgents, listAgentsFromWorkspace, flushAgents } from '../utils/conf';
import { terminal } from 'terminal-kit';

export async function agentsCommand(options: {
  all?: boolean;
  flush?: boolean;  
  workspace?: string;
}): Promise<void> {
  if (options.flush) {
    await flushAgents();
    terminal('All agents have been flushed from the configuration.\n');
    return;
  }

  let agents;
  if (options.all) {
    agents = await listAgents();
  } else {
    let workspaceUrl = options.workspace || process.cwd();
    agents = await listAgentsFromWorkspace(workspaceUrl);
  }

  if (agents.length > 0) {
    terminal.table(
      [
        ['Name', 'Configuration', 'Workspace'],
        ...agents.map((agent) => [
          agent.name.substring(0, 10),
          agent.configuration,
          agent.workspace,
        ])
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