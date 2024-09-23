import { marked, MarkedExtension } from 'marked';
import { markedTerminal } from 'marked-terminal';

import { AgentManager } from '../managers/agentManager';
import { getEligibleAgent, readConfig } from '../utils/conf';
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
  getSubActionMessage,
  isStreamingContext,
  processStreamedResponse,
} from '../helpers/streams';
import {
  getWorkspaceChanges,
  synchroniseWorkspaceChanges,
} from '../helpers/workspace';

import { initCommand } from './init';
import { AgentConfig, FunctionExecutionResult } from '../utils/types';
import { getFunctionArgs } from '../utils/actions';

marked.use(markedTerminal() as MarkedExtension);

async function initializeAgentConfig(
  workspace: string,
  skipWarmup: boolean
): Promise<AgentConfig> {
  let eligible = getEligibleAgent(workspace);
  if (!eligible && !skipWarmup) {
    await initCommand({ workspace });
  }

  eligible = getEligibleAgent(workspace);
  if (!eligible) {
    throw new Error('No eligible agent found after init');
  }

  return eligible;
}

async function executeActions(
  actions: FunctionAction[],
  logger: Logger,
  agentManager: AgentManager
) {
  const toolOutputs: FunctionExecutionResult[] = [];
  for (const action of actions) {
    Logger.debug('Action:', action);
    const args = getFunctionArgs(action);

    let taskTitle: string = args.answer || args.command || '';
    if (args.url) {
      taskTitle = 'Browsing: ' + args.url;
    }

    logger.start(taskTitle);
    // subtask.output = taskTitle || action.function.arguments;
    const toolOutput = await agentManager.executeAction(action, args);
    Logger.debug('Tool output:', toolOutput);
    toolOutputs.push(toolOutput);
    const msg = getSubActionMessage(taskTitle, action);
    if (toolOutput.success) {
      logger.stop(msg);
    } else {
      logger.cancel(msg, 'Execution failed');
    }
  }

  return toolOutputs;
}

const logger = new Logger();

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
  logger.start('Querying agent');
  try {
    const config = readConfig();
    const workspace = !options.workspace ? process.cwd() : options.workspace;
    const skipWarmup = !!options.skipWarmup;
    const stream = options.stream ?? config?.stream ?? true;

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
      const toolOutputs = await executeActions(actions, logger, agentManager);
      actions = [];

      logger.start('Reviewing the job');

      let submitReponse;
      if (toolOutputs.length) {
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
  } catch (e: unknown) {
    logger.handleError(e as Error);
    // Logger.error('Command error', e);
  }
}
