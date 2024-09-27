import { marked, MarkedExtension } from 'marked';
import { markedTerminal } from 'marked-terminal';
import {
  cancelQuery,
  FunctionAction,
  getAgentStatus,
  queryAgent,
  QueryResponseDTO,
  submitToolOutputs,
} from '../helpers/api';
import {
  getActionPostfix,
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
import { AgentManager } from '../managers/agentManager';
import { getEligibleAgent, readConfig } from '../utils/conf';
import Logger from '../utils/logger';

marked.use(markedTerminal() as MarkedExtension);

const initializeAgentConfig = async (
  workspace: string,
  skipWarmup: boolean
): Promise<AgentConfig> => {
  const findEligibleAgent = async (): Promise<AgentConfig> => {
    let eligible = getEligibleAgent(workspace);
    if (!eligible && !skipWarmup) {
      await initCommand({ workspace });
      eligible = getEligibleAgent(workspace);
    }
    if (!eligible) throw new Error('No eligible agent found after init');
    return eligible;
  };

  return findEligibleAgent();
};

const executeActions = async (
  actions: FunctionAction[],
  agentManager: AgentManager
): Promise<FunctionExecutionResult[]> => {
  const results: FunctionExecutionResult[] = [];
  for (const action of actions) {
    Logger.debug('Action:', action);
    const args = getFunctionArgs(action);
    const taskTitle =
      args.answer || args.command || (args.url ? `Browsing: ${args.url}` : '');
    logger.start(`${taskTitle} ${getActionPostfix(action)}`);

    const toolOutput = await agentManager.executeAction(action, args);
    Logger.debug('Tool output:', toolOutput);

    const msg = getSubActionMessage(taskTitle, action);
    toolOutput.success
      ? logger.stop(msg, 0)
      : logger.stop(`(failed) ${msg}`, 1);
    results.push(toolOutput);
  }

  return results;
};

const logger = new Logger();

export const queryCommand = async (
  query: string,
  options: {
    workspace?: string;
    agentId?: string;
    skipWarmup?: boolean;
    stream?: boolean;
    callback?: (...args: any[]) => Promise<void>;
    noPersistentAgent?: boolean;
  }
) => {
  Logger.debug('Options:', options);

  try {
    const config = readConfig();
    const workspace = options.workspace || process.cwd();
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

    const synchronizeWorkspace = async (): Promise<boolean> => {
      const workspaceDiff = await getWorkspaceChanges(workspace);
      if (workspaceDiff.hasChanges) {
        logger.start('Synchronizing workspace');
        await synchroniseWorkspaceChanges(agentConfig.id, workspace);
        logger.stop('Workspace synchronized');
        return true;
      }
      return false;
    };

    const checkAgentStatus = async (): Promise<void> => {
      const statusResponse = await getAgentStatus(agentManager.id);
      Logger.debug('Agent status:', statusResponse?.status);
      if (
        !!statusResponse &&
        ['in_progress', 'requires_action'].includes(statusResponse.status)
      ) {
        logger.message('Cancelling previous task');
        await cancelQuery(agentManager.id);
        logger.stop('Previous task cancelled');
      }
    };

    const handleAgentResponse = async (
      agentResponse: any
    ): Promise<[FunctionAction[], string]> => {
      let actions: FunctionAction[] = [];
      let queryResponse = '';

      if (isStreamingContext(stream, agentResponse)) {
        const res = await processStreamedResponse(agentResponse);
        if (res.actions.length) actions = res.actions;
        if (res.message) queryResponse = res.message;
      } else {
        if (agentResponse.asynchronous) {
          const status = await agentManager.checkStatus();
          if (status?.actions.length) actions = status.actions;
          queryResponse = queryResponse || status?.answer || '';
        } else {
          if (agentResponse.actions) actions = agentResponse.actions;
          if (agentResponse.response) queryResponse = agentResponse.response;
        }
      }

      return [actions, queryResponse];
    };

    const processSubmitResponse = async (
      submitResponse: QueryResponseDTO | undefined
    ): Promise<[FunctionAction[], string]> => {
      let actions: FunctionAction[] = [];
      let finalResponse = '';

      if (isStreamingContext(stream, submitResponse)) {
        const res = await processStreamedResponse(submitResponse);
        if (res.actions.length) actions = res.actions;
        if (res.message) finalResponse = res.message;
      } else if (submitResponse) {
        const {
          actions: responseActions,
          asynchronous,
          response: responseAnswer,
        } = submitResponse;
        if (asynchronous) {
          const statusResponse = await agentManager.checkStatus();
          if (statusResponse?.actions?.length) actions = statusResponse.actions;
          if (statusResponse?.answer) finalResponse = statusResponse.answer;
        } else {
          if (responseActions?.length) actions = responseActions;
          if (responseAnswer) finalResponse = responseAnswer;
        }
      }

      return [actions, finalResponse];
    };

    const changedWorkspace = !skipWarmup && (await synchronizeWorkspace());
    if (agentManager.capabilities.includes('async')) await checkAgentStatus();

    logger.start('Thinking');
    const agentResponse = await queryAgent(
      agentManager.id,
      changedWorkspace,
      query,
      stream
    );
    // eslint-disable-next-line prefer-const
    let [actions, queryResponse] = await handleAgentResponse(agentResponse);
    logger.stop(queryResponse || 'Done processing');

    let finalResponse = '';
    while (actions.length) {
      const toolOutputs = await executeActions(actions, agentManager);
      logger.start('Reviewing the job');
      const submitResponse = toolOutputs.length
        ? await submitToolOutputs(agentManager.id, toolOutputs, stream)
        : undefined;
      [actions, finalResponse] = await processSubmitResponse(submitResponse);
      if (actions.length && finalResponse) {
        logger.stop(finalResponse);
      }
    }

    if (finalResponse) {
      logger.stop('Execution completed');
      Logger.agent(finalResponse);
    }

    if (options.callback) await options.callback(finalResponse);
  } catch (error) {
    logger.handleError(error as Error);
  }
};
