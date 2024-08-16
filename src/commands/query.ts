import axios from 'axios';
import { marked, MarkedExtension } from 'marked';
import { markedTerminal } from 'marked-terminal';

import { TaskManager } from '../utils/taskManager';
import { listAgents, listAgentsFromWorkspace, readConfig } from '../utils/conf';
import { API_HOST, API_VERSION } from '../constants';

import { initCommand } from './init';
import { Agent } from '../agent';
import { Logger } from '../utils/logger';

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
      Logger.warn('no agent found in the specified workspace, initializing...');
      await initCommand({ workspace });
      await taskManager.run(
        'Warming up... can take a few seconds.',
        async () => new Promise((resolve) => setTimeout(resolve, 5000))
      );

      await queryCommand(query, options);
      return;
    }
    Logger.log(`Current workspace: ${eligible?.workspace || workspace} \n`);
  }

  const agent = new Agent({
    id: eligible.id,
    name: eligible.name,
    engine: eligible.engine,
    callback: options.callback,
    workspace,
    queryCommand,
  });

  try {
    await agent.toggleLoader();
    const { data } = await axios.post(
      `${API_HOST}${API_VERSION}/agents/${agent.id}/query`,
      { query },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config?.api_key}`,
        },
        timeout: 5 * 60 * 1000,
      }
    );

    if (data.asynchronous && data.asynchronous === true) {
      return agent.checkStatus();
    }

    if (data.response) {
      Logger.agent(data.response);
    }

    if (data.actions) {
      return await agent.processActions(
        data.actions,
        data.asynchronous && data.asynchronous === true
      );
    }

    process.exit(0);
  } catch (error: any) {
    Logger.error('Error querying agent:', error);
    process.exit(0);
  }
}
