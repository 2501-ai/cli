import { marked, MarkedExtension } from 'marked';
import { markedTerminal } from 'marked-terminal';
import axios, { AxiosError } from 'axios';
import { jsonrepair } from 'jsonrepair';

import { AgentManager } from '../managers/agentManager';
import { getEligibleAgents, readConfig } from '../utils/conf';
import { convertFormToJSON } from '../utils/json';
import Logger from '../utils/logger';
import {
  cancelQuery,
  FunctionAction,
  getAgentStatus,
  queryAgent,
  QueryResponseDTO,
  submitToolOutputs,
} from '../helpers/api';
import {
  isStreamingContext,
  processStreamedResponse,
} from '../helpers/streams';
import {
  getWorkspaceChanges,
  synchroniseWorkspaceChanges,
} from '../helpers/workspace';

import { initCommand } from './init';
import { AgentConfig } from '../utils/types';

marked.use(markedTerminal() as MarkedExtension);
const isDebug = process.env.DEBUG === 'true';

async function initializeAgentConfig(
  workspace: string,
  skipWarmup: boolean
): Promise<AgentConfig> {
  let eligible = getEligibleAgents(workspace);
  if (!eligible && !skipWarmup) {
    await initCommand({ workspace });
  }

  eligible = getEligibleAgents(workspace);
  if (!eligible) {
    throw new Error('No eligible agents found after init');
  }

  return eligible;
}

async function executeActions(
  actions: FunctionAction[],
  logger: Logger,
  agentManager: AgentManager,
  toolOutputs: any[]
) {
  for (const action of actions) {
    let args: any;

    if (action.function.arguments) {
      args = action.function.arguments;

      // Logger.debug('Previous args: %s', args);
      if (typeof args === 'string') {
        const standardArgs = args.replace(/`([\s\S]*?)`/g, (_, content) => {
          const processedContent: string = content.replace(/\n/g, '\\n');
          return `"${processedContent.replace(/"/g, '\\"')}"`;
        });
        // Logger.debug('Standard args:', standardArgs);
        const fixed_args = jsonrepair(standardArgs);
        args = JSON.parse(convertFormToJSON(fixed_args));
        // Logger.debug('New args: %s', args);
      }
    } else {
      args = action.args;
    }

    let taskTitle: string = args.answer || args.command || '';
    if (args.url) {
      taskTitle = 'Browsing: ' + args.url;
    }

    logger.start(taskTitle);
    // subtask.output = taskTitle || action.function.arguments;
    const toolOutput = await agentManager.executeAction(action, args);
    Logger.debug('Tool output:', toolOutput);
    toolOutputs.push(toolOutput);
    logger.stop(taskTitle);
  }
}

// Function to execute the query command
export async function queryCommand(
  query: string,
  options: {
    workspace?: string;
    agentId?: string;
    skipWarmup?: boolean;
    stream?: boolean;
    callback?: (...args: any[]) => Promise<void>;
    noPersistentAgent?: boolean;
  }
) {
  Logger.debug('Options:', options);
  try {
    const config = readConfig();
    const workspace = !options.workspace ? process.cwd() : options.workspace;
    const skipWarmup = !!options.skipWarmup;
    const stream = options.stream ?? config?.stream ?? true;

    const logger = new Logger();

    const agentConfig = await initializeAgentConfig(workspace, skipWarmup);

    const agentManager = new AgentManager({
      id: agentConfig.id,
      name: agentConfig.name,
      engine: agentConfig.engine,
      capabilities: agentConfig.capabilities,
      workspace,
    });

    let changedWorkspace = false;
    if (agentConfig && !skipWarmup) {
      const workspaceDiff = await getWorkspaceChanges(workspace);
      changedWorkspace = workspaceDiff.hasChanges;
      if (workspaceDiff.hasChanges) {
        logger.start('Synchronizing workspace');
        await synchroniseWorkspaceChanges(agentConfig.id, workspace);
        logger.stop('Workspace synchronized');
      }
    }
    // Pre-check agent status
    if (agentManager.capabilities.includes('async')) {
      const statusReponse = await getAgentStatus(agentManager.id);
      Logger.debug('Agent status:', statusReponse?.status);
      if (
        statusReponse?.status === 'in_progress' ||
        statusReponse?.status === 'requires_action'
      ) {
        logger.start('Cancelling previous task');
        await cancelQuery(agentManager.id);
        logger.stop('Previous task cancelled');
      }
    }

    logger.start('Thinking');
    Logger.debug('Querying agent..', agentManager.id);
    const agentResponse = await queryAgent(
      agentManager.id,
      changedWorkspace,
      query,
      stream
    );

    let actions: FunctionAction[] = [];
    let queryResponse = '';
    if (isStreamingContext(stream, agentResponse)) {
      const res = await processStreamedResponse(agentResponse, logger);

      if (res.actions.length) {
        actions = res.actions;
        queryResponse = 'Executing action plan';
      }
      if (res.message) {
        queryResponse = res.message;
      }
    } else {
      Logger.debug('Agent response:', agentResponse);

      if (agentResponse.asynchronous) {
        const status = await agentManager.checkStatus();
        if (status?.actions.length) {
          actions = status.actions;
          queryResponse = 'Executing action plan';
        }

        queryResponse = queryResponse || status?.answer || '';
      } else {
        if (agentResponse.actions) {
          actions = agentResponse.actions;
          queryResponse = 'Executing action plan';
        }
      }

      if (agentResponse.response) {
        queryResponse = agentResponse.response;
      }
    }

    logger.stop(queryResponse || 'Done processing');

    let finalResponse = '';

    // WHILE
    while (actions?.length) {
      const toolOutputs: any[] = [];
      await executeActions(actions, logger, agentManager, toolOutputs);
      actions = [];

      logger.start('Reviewing the job');

      let submitReponse;
      if (toolOutputs?.length) {
        submitReponse = await submitToolOutputs(
          agentManager.id,
          toolOutputs,
          stream
        );
      }

      // Reset toolOutputs after submition
      toolOutputs.splice(0, toolOutputs.length);

      // Streaming mode
      if (isStreamingContext(stream, submitReponse)) {
        Logger.debug('Stream mode');
        const res = await processStreamedResponse(submitReponse, logger);
        if (res.actions.length) {
          actions = res.actions;
        }
        if (res.message) {
          finalResponse = res.message;
        }
      } else if (submitReponse) {
        Logger.debug('Standard mode');
        const {
          actions: responseActions,
          asynchronous,
          response: responseAnswer,
        } = submitReponse as QueryResponseDTO;
        if (asynchronous) {
          // Standard status polling mode
          const statusResponse = await agentManager.checkStatus();
          if (statusResponse?.actions?.length) {
            actions = statusResponse.actions;
          }
          if (statusResponse?.answer) {
            // Logger.agent(statusResponse?.answer);
            finalResponse = statusResponse?.answer;
          }
        } else {
          Logger.debug('Sync mode submitReponse', submitReponse);
          if (responseActions?.length) {
            responseAnswer && logger.message(responseAnswer);
            actions = responseActions;
          }
          if (responseAnswer) {
            finalResponse = responseAnswer;
          }
        }
      }
    }
    // WHILE END

    if (finalResponse) {
      logger.stop('Execution completed');
      Logger.agent(finalResponse);
    }
    if (options.callback) {
      await options.callback(finalResponse);
    }
  } catch (e) {
    if (isDebug) {
      if (axios.isAxiosError(e)) {
        const axiosError = e as AxiosError;
        Logger.error('Command error - Axios error', {
          data: axiosError.response?.data ?? '(no data)',
          config: axiosError.config,
          status:
            axiosError.status ?? axiosError.response?.status ?? '(no status)',
          statusText:
            axiosError.response?.statusText ??
            axiosError.response?.statusText ??
            '(no statusText)',
        });
      } else {
        Logger.error('Command error', e);
      }
    } else {
      Logger.error("Unexpected error. We're working on it!");
    }
    process.exit(1);
  }
}
