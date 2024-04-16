import { listAgents, listAgentsFromWorkspace } from '../utils/conf';
import { terminal } from 'terminal-kit';

export async function agentsCommand(options: {
  all?: boolean;
  workspace?: string;
}): Promise<void> {
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
        ['ID', 'Configuration', 'Workspace'],
        ...agents.map((agent) => [
          agent.id.substring(0, 10),
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