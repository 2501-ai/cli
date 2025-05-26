import chalk from 'chalk';
import fs from 'fs';
import { marked, MarkedExtension } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { Readable } from 'stream';

import {
  createTask,
  indexFiles,
  queryAgent,
  submitToolOutputs,
} from '../helpers/api';
import {
  getActionPostfix,
  getSubActionMessage,
  isStreamingContext,
  parseStreamedResponse,
  toItalic,
} from '../helpers/streams';
import {
  generateWorkspaceZip,
  getWorkspaceState,
  resolveWorkspacePath,
  writeWorkspaceState,
} from '../helpers/workspace';
import { AgentManager } from '../managers/agentManager';
import { getFunctionArgs } from '../utils/actions';
import { getEligibleAgent } from '../utils/conf';
import { credentialsService } from '../utils/credentials';
import { getDirectoryMd5Hash } from '../utils/files';
import Logger, { getTerminalWidth } from '../utils/logger';
import { isLooping } from '../utils/loopDetection';
import { generateTree } from '../utils/tree';
import {
  AgentConfig,
  FunctionAction,
  FunctionExecutionResult,
  WorkspaceState,
} from '../utils/types';
import { initCommand } from './init';
import { ConfigManager } from '../managers/configManager';

marked.use(markedTerminal() as MarkedExtension);

const logger = new Logger();

const initializeAgentConfig = async (
  workspace: string
): Promise<AgentConfig | null> => {
  let eligible = getEligibleAgent(workspace);
  let force = false;
  if (!eligible) {
    await initCommand({ workspace });
    eligible = getEligibleAgent(workspace);
    force = true;
  }

  // Ensure workspace is always synchronized after initialization
  if (eligible) {
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

    const subActionMessage = getSubActionMessage(
      taskTitle,
      action,
      toolOutput.success
    );
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

  // Get both state and changes in a single pass
  const { currentState, diff: workspaceDiff } = await getWorkspaceState(
    workspace,
    agentId
  );
  Logger.debug('Workspace diff:', { workspaceDiff });

  if (workspaceDiff.isEmpty) return false;

  if (workspaceDiff.hasChanges || force) {
    logger.start('Synchronizing workspace');

    Logger.debug('Agent Workspace has changes, synchronizing...');
    // Pass the already computed files to avoid recomputation
    const files = await generateWorkspaceZip(workspace, {
      fileHashes: currentState.fileHashes,
      totalSize: currentState.totalSize,
    });

    if (process.env.TFZO_NODE_ENV !== 'dev') {
      // Don't pollute the filesystem with temporary files
      fs.unlinkSync(files[0].path);
      Logger.debug('Agent : Workspace ZIP deleted:', files[0].path);
    }

    await indexFiles(agentId, files);

    // Update workspace state using the already computed state
    const newState: WorkspaceState = {
      state_hash: currentState.md5,
      file_hashes: currentState.fileHashes,
      path: workspace,
      agent_id: agentId,
    };
    writeWorkspaceState(newState);

    await new Promise((resolve) => setTimeout(resolve, 2000));
    logger.stop('Workspace synchronized');
    return true;
  }
  return false;
};

const handleReasoningSteps = (streamResponse: Readable) => {
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
};

const parseAgentResponse = async (
  agentResponse: any,
  stream: boolean
): Promise<[FunctionAction[], string]> => {
  let actions: FunctionAction[] = [];
  let queryResponse = '';

  if (isStreamingContext(stream, agentResponse)) {
    // TODO: stream doesnt bring any benefit here since we wait for the whole stream to be processed.
    const res = await parseStreamedResponse(agentResponse);
    if (res.actions.length) actions = res.actions;
    if (res.message) queryResponse = res.message;
  } else {
    if (agentResponse.actions) actions = agentResponse.actions;
    if (agentResponse.response) queryResponse = agentResponse.response;
  }

  return [actions, queryResponse];
};

export const queryCommand = async (
  query: string,
  options: {
    workspace?: string;
    agentId?: string;
    stream?: boolean;
    noPersistentAgent?: boolean;
    plugins?: string;
    credentials?: string;
    taskId?: string;
  }
) => {
  Logger.debug('Options:', options);

  try {
    const configManager = ConfigManager.instance;
    const config = configManager.config;
    const workspace = resolveWorkspacePath(options);
    Logger.debug('Workspace:', workspace);

    const stream = options.stream ?? config.stream ?? true;

    ////////// Agent Init //////////
    const agentConfig = await initializeAgentConfig(workspace);

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

    ////////// Workflow start //////////
    let workspaceChanged = false;
    let taskId = options.taskId;

    // Run synchronizeWorkspace and createTask in parallel
    const [syncResult, taskResult] = await Promise.all([
      synchronizeWorkspace(agentConfig.id, workspace),
      taskId
        ? Promise.resolve({ id: taskId })
        : createTask(agentConfig.id, query),
    ]);

    workspaceChanged = syncResult;
    taskId = taskResult.id;

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
      taskId,
      workspaceTree,
      stream
    );

    if (stream) {
      const streamResponse = agentResponse as Readable;
      handleReasoningSteps(streamResponse);
    }

    // eslint-disable-next-line prefer-const
    let [actions, queryResponse] = await parseAgentResponse(
      agentResponse,
      stream
    );
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
      // Submit the tool outputs to the agent
      const submitResponse = toolOutputs.length
        ? await submitToolOutputs(agentManager.id, taskId, toolOutputs, stream)
        : undefined;
      [actions, finalResponse] = await parseAgentResponse(
        submitResponse,
        stream
      );
      if (actions.length && finalResponse) {
        logger.stop(finalResponse);
      }
    }

    if (finalResponse) {
      logger.stop(chalk.italic.gray('-'.repeat(getTerminalWidth() - 10)));
      Logger.agent(finalResponse);
    }
  } catch (error) {
    logger.handleError(error as Error);
  }
};
