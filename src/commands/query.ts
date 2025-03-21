import fs from 'fs';
import { Readable } from 'stream';
import { marked, MarkedExtension } from 'marked';
import { markedTerminal } from 'marked-terminal';
import chalk from 'chalk';
import { indexFiles, queryAgent, submitToolOutputs } from '../helpers/api';
import {
  getActionPostfix,
  getSubActionMessage,
  isStreamingContext,
  processStreamedResponse,
  toItalic,
} from '../helpers/streams';
import {
  getWorkspaceChanges,
  resolveWorkspacePath,
  updateWorkspaceState,
} from '../helpers/workspace';
import { initCommand } from './init';
import {
  AgentConfig,
  FunctionAction,
  FunctionExecutionResult,
  QueryResponseDTO,
} from '../utils/types';
import { getFunctionArgs } from '../utils/actions';
import { AgentManager } from '../managers/agentManager';
import { getEligibleAgent, readConfig } from '../utils/conf';
import Logger, { getTerminalWidth } from '../utils/logger';
import { generatePDFs } from '../utils/pdf';
import { isLooping } from '../utils/loopDetection';
import { generateTree } from '../utils/tree';
import { getDirectoryMd5Hash } from '../utils/files';
import credentialsService from '../utils/credentials';

marked.use(markedTerminal() as MarkedExtension);

const logger = new Logger();

const initializeAgentConfig = async (
  workspace: string,
  skipWarmup: boolean
): Promise<AgentConfig | null> => {
  let eligible = getEligibleAgent(workspace);
  let force = false;
  if (!eligible && !skipWarmup) {
    await initCommand({ workspace });
    eligible = getEligibleAgent(workspace);
    force = true;
  }

  // Ensure workspace is always synchronized after initialization
  if (eligible && !skipWarmup) {
    await synchronizeWorkspace(eligible.id, workspace, force);
  }

  return eligible;
};

const executeActions = async (
  actions: FunctionAction[],
  agentManager: AgentManager
): Promise<FunctionExecutionResult[]> => {
  const results: FunctionExecutionResult[] = [];
  for (const action of actions) {
    Logger.debug('Action:', action);
    const args = getFunctionArgs(action);

    // Replace credential placeholders in args
    // This is exclusively for the run_shell action
    if (args.command) {
      args.command = credentialsService.replaceCredentialPlaceholders(
        args.command
      );
    }

    const taskTitle =
      args.answer || args.command || (args.url ? `Browsing: ${args.url}` : '');

    logger.start(`${taskTitle} ${getActionPostfix(action)}`);

    const toolOutput = await agentManager.executeAction(action, args);
    Logger.debug('Tool output:', toolOutput);

    const subActionMessage = getSubActionMessage(taskTitle, action);
    toolOutput.success
      ? logger.stop(subActionMessage, 0)
      : logger.stop(`(failed) ${subActionMessage}`, 1);
    results.push(toolOutput);
  }

  return results;
};

const synchronizeWorkspace = async (
  agentId: string,
  workspace: string,
  force: boolean = false
): Promise<boolean> => {
  Logger.debug('Synchronizing workspace:', workspace);
  const workspaceDiff = await getWorkspaceChanges(workspace, agentId);
  Logger.debug('Workspace diff:', { workspaceDiff });
  if (workspaceDiff.isEmpty) return false;

  if (workspaceDiff.hasChanges || force) {
    logger.start('Synchronizing workspace');

    Logger.debug('Agent Workspace has changes, synchronizing...');
    // TODO: improve and send only changed files ?
    const files = await generatePDFs(workspace);

    if (process.env.NODE_ENV !== 'dev') {
      // Don't pollute the filesystem with temporary files
      fs.unlinkSync(files[0].path);
      Logger.debug('Agent : Workspace PDF deleted:', files[0].path);
    }

    await indexFiles(agentId, files);
    // Update the new state of the workspace
    await updateWorkspaceState(workspace, agentId);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    logger.stop('Workspace synchronized');
    return true;
  }
  return false;
};

export const queryCommand = async (
  query: string,
  options: {
    workspace?: string;
    agentId?: string;
    skipWarmup?: boolean;
    stream?: boolean;
    callback?: (...args: any[]) => Promise<void>;
    noPersistentAgent?: boolean;
    plugins?: string;
    credentials?: string;
  }
) => {
  Logger.debug('Options:', options);

  try {
    const config = readConfig();
    const workspace = resolveWorkspacePath(options);
    Logger.debug('Workspace:', workspace);

    const skipWarmup = !!options.skipWarmup;
    const stream = options.stream ?? config?.stream ?? true;

    ////////// Agent Init //////////
    const agentConfig = await initializeAgentConfig(workspace, skipWarmup);

    // If not agent is eligible, it usually means there was an error during the init process that is already displayed.
    if (!agentConfig) {
      return;
    }
    const agentManager = new AgentManager({
      id: agentConfig.id,
      name: agentConfig.name,
      engine: agentConfig.engine,
      capabilities: agentConfig.capabilities,
      workspace,
    });

    const handleAgentResponse = async (
      agentResponse: any
    ): Promise<[FunctionAction[], string]> => {
      let actions: FunctionAction[] = [];
      let queryResponse = '';

      if (isStreamingContext(stream, agentResponse)) {
        // TODO: stream doesnt bring any benefit here since we wait for the whole stream to be processed.
        const res = await processStreamedResponse(agentResponse);
        if (res.actions.length) actions = res.actions;
        if (res.message) queryResponse = res.message;
      } else {
        if (agentResponse.actions) actions = agentResponse.actions;
        if (agentResponse.response) queryResponse = agentResponse.response;
      }

      return [actions, queryResponse];
    };

    const handleSubmitResponse = async (
      submitResponse: QueryResponseDTO | undefined
    ): Promise<[FunctionAction[], string]> => {
      let actions: FunctionAction[] = [];
      let finalResponse = '';

      if (isStreamingContext(stream, submitResponse)) {
        // TODO: stream doesnt bring any benefit here since we wait for the whole stream to be processed.
        const res = await processStreamedResponse(submitResponse);
        if (res.actions.length) actions = res.actions;
        if (res.message) finalResponse = res.message;
      } else if (submitResponse) {
        const { actions: responseActions, response: responseAnswer } =
          submitResponse;
        if (responseActions?.length) actions = responseActions;
        if (responseAnswer) finalResponse = responseAnswer;
      }

      return [actions, finalResponse];
    };

    ////////// Workflow start //////////
    let workspaceChanged = false;

    if (!skipWarmup) {
      workspaceChanged = await synchronizeWorkspace(agentConfig.id, workspace);
    }

    const workspaceData = getDirectoryMd5Hash({
      directoryPath: workspace,
    });
    const workspaceTree = generateTree(
      Array.from(workspaceData.fileHashes.keys())
    );

    logger.start('Thinking');
    const agentResponse = await queryAgent(
      agentManager.id,
      workspaceChanged,
      query,
      workspaceTree,
      stream
    );

    if (stream) {
      const streamResponse = agentResponse as Readable;
      streamResponse.on('data', (data: any) => {
        if (!data.toString().includes('reasoning')) {
          return;
        }

        try {
          const res = JSON.parse(data.toString());
          if (res.status === 'reasoning') {
            let stepMessage: string = `Reasoning steps that will be followed:`;
            for (const step of res.steps.steps) {
              stepMessage += `\n${chalk.gray('│')}  ${toItalic(` └ ${step}`)}`;
            }
            logger.stop(stepMessage);
            logger.start('Processing');
          }
        } catch (e) {
          // Ignore
        }
      });
    }

    // eslint-disable-next-line prefer-const
    let [actions, queryResponse] = await handleAgentResponse(agentResponse);
    if (queryResponse) {
      logger.stop(queryResponse);
    }

    let finalResponse = '';
    while (actions.length) {
      if (isLooping(actions)) {
        return logger.stop(
          'Unfortunately, a loop has been detected. Please try again.',
          1
        );
      }
      const toolOutputs = await executeActions(actions, agentManager);
      logger.start('Reviewing the job');
      const submitResponse = toolOutputs.length
        ? await submitToolOutputs(agentManager.id, toolOutputs, stream)
        : undefined;
      [actions, finalResponse] = await handleSubmitResponse(submitResponse);
      if (actions.length && finalResponse) {
        logger.stop(finalResponse);
      }
    }

    if (finalResponse) {
      logger.stop(chalk.italic.gray('-'.repeat(getTerminalWidth() - 10)));
      Logger.agent(finalResponse);
    }

    if (options.callback) await options.callback(finalResponse);
  } catch (error) {
    logger.handleError(error as Error);
  }
};
