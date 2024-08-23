import axios from 'axios';
import { marked, MarkedExtension } from 'marked';
import { markedTerminal } from 'marked-terminal';

import { TaskManager } from '../managers/taskManager';
import { listAgents, listAgentsFromWorkspace, readConfig } from '../utils/conf';
import { API_HOST, API_VERSION } from '../constants';

import { initCommand } from './init';
import { AgentManager } from '../managers/agentManager';
import { Logger } from '../utils/logger';
import {
  getWorkspaceChanges,
  indexWorkspaceFiles,
  syncWorkspaceFiles,
  syncWorkspaceState,
} from '../helpers/workspace';

marked.use(markedTerminal() as MarkedExtension);

// Function to execute the query command
export async function queryCommand(
  query: string,
  options: {
    workspace?: string;
    agentId?: string;
    skipWarmup?: boolean;
    callback?: (...args: any[]) => Promise<void>;
    noPersistentAgent?: boolean;
  }
): Promise<void> {
  const config = readConfig();

  const workspace = options.workspace || process.cwd();
  const agentId = options.agentId;
  const skipWarmup = options.skipWarmup;

  const agents = agentId
    ? await listAgents()
    : await listAgentsFromWorkspace(workspace);
  const eligible = agents.find((a) => a.id === agentId) || agents[0] || null;

  if (!skipWarmup) {
    if (!eligible) {
      const taskManager = new TaskManager();
      // Logger.warn('no agent found in the specified workspace, initializing...');
      await initCommand({ workspace });
      await taskManager.run(
        'Warming up... can take a few seconds.',
        async () => new Promise((resolve) => setTimeout(resolve, 5000))
      );

      await queryCommand(query, options);
      return;
    }
    Logger.debug(`Current workspace: ${eligible?.workspace || workspace} \n`);
  }

  const agentClient = new AgentManager({
    id: eligible.id,
    name: eligible.name,
    engine: eligible.engine,
    callback: options.callback,
    workspace,
    queryCommand,
  });

  try {
    await agentClient.toggleLoader();
    const changed = await synchroniseWorkspaceChanges(
      agentClient.name,
      workspace
    );

    const { data } = await axios.post(
      `${API_HOST}${API_VERSION}/agents/${agentClient.id}/query`,
      { query, changed },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config?.api_key}`,
        },
        timeout: 5 * 60 * 1000,
      }
    );

    const taskManager = new TaskManager();
    if (data.asynchronous && data.asynchronous === true) {
      return await taskManager.run('Thinking...', async () => {
        await agentClient.checkStatus();
        await synchroniseWorkspaceChanges(agentClient.name, workspace);
      });
    }

    if (data.response) {
      Logger.agent(data.response);
    }

    if (data.actions) {
      return await taskManager.run('Processing actions...', async () => {
        await agentClient.processActions(
          data.actions,
          data.asynchronous === true
        );
        await synchroniseWorkspaceChanges(agentClient.name, workspace);
      });
    } else {
      Logger.debug('No actions to process');
    }

    process.exit(0);
  } catch (error: any) {
    Logger.error('Error querying agent:', error);
    process.exit(1);
  }
}

async function synchroniseWorkspaceChanges(
  agentName: string,
  workspace: string
) {
  const workspaceDiff = await getWorkspaceChanges(workspace);
  if (workspaceDiff.hasChanges) {
    Logger.debug('Agent : Workspace has changes, synchronizing...');
    await syncWorkspaceState(workspace);
    // TODO: improve and send only changed files ?
    const workspaceResponse = await syncWorkspaceFiles(workspace);
    if (workspaceResponse?.data && workspaceResponse?.files.length) {
      await indexWorkspaceFiles(agentName, workspaceResponse.data);
    }
  }
  return workspaceDiff.hasChanges;
}
