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
  getWorkspaceHash,
  resolveWorkspacePath,
  writeWorkspaceState,
} from '../helpers/workspace';
import { AgentManager } from '../managers/agentManager';
import { ConfigManager } from '../managers/configManager';
import { updateContext } from '../telemetry/contextBuilder';
import { getFunctionArgs } from '../utils/actions';
import { getEligibleAgent } from '../utils/conf';
import { credentialsService } from '../utils/credentials';
import { getDirectoryMd5Hash } from '../utils/files';
import Logger, { getTerminalWidth } from '../utils/logger';
import { isLooping } from '../utils/loopDetection';
import {
  AgentConfig,
  FunctionAction,
  FunctionExecutionResult,
  WorkspaceState,
} from '../utils/types';
import { initCommand } from './init';
import { RemoteExecutor } from '../remoteExecution/remoteExecutor';

marked.use(markedTerminal() as MarkedExtension);

interface QueryOptions {
  workspace?: string;
  agentId?: string;
  stream?: boolean;
  noPersistentAgent?: boolean;
  plugins?: string;
  credentials?: string;
  taskId?: string;
  remoteExec?: string;
  remotePrivateKey?: string;
  remoteExecPassword?: string;
  remoteExecType?: string;
  rawSsh?: boolean;
}

const logger = new Logger();

const initializeAgentConfig = async (
  resolvedWorkspace: string,
  options: QueryOptions
): Promise<{
  agentConfig: AgentConfig | null;
  workspaceChanged: boolean;
}> => {
  let eligibleAgent = getEligibleAgent(resolvedWorkspace);
  let force = false;
  if (!eligibleAgent) {
    await initCommand({ ...options, workspace: resolvedWorkspace });
    eligibleAgent = getEligibleAgent(resolvedWorkspace);
    force = true;
  }

  // Ensure workspace is always synchronized after initialization
  let workspaceChanged = false;
  if (eligibleAgent) {
    workspaceChanged = await synchronizeWorkspace(
      eligibleAgent,
      resolvedWorkspace,
      force
    );
  }

  return { agentConfig: eligibleAgent, workspaceChanged };
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

/**
 * Synchronize the workspace with the remote server.
 * @returns True if the workspace was synchronized, false otherwise.
 */
const synchronizeWorkspace = async (
  agent: AgentConfig,
  workspace: string,
  force: boolean = false
): Promise<boolean> => {
  Logger.debug('Synchronizing workspace:', workspace);
  // Remote execution agents don't need workspace synchronization
  // since they operate on remote files directly
  if (agent?.remote_exec?.enabled) {
    return false;
  }

  // Get both state and changes in a single pass
  const { hash, diff } = await getWorkspaceHash(workspace, agent.id);
  Logger.debug('Workspace diff:', { diff });

  if (diff.isEmpty) return false;

  if (diff.hasChanges || force) {
    logger.start('Synchronizing workspace');

    Logger.debug('Agent Workspace has changes, synchronizing...');
    // Pass the already computed files to avoid recomputation
    const files = await generateWorkspaceZip(workspace, {
      fileHashes: hash.fileHashes,
      totalSize: hash.totalSize,
    });

    if (process.env.TFZO_NODE_ENV !== 'dev') {
      // Don't pollute the filesystem with temporary files
      fs.unlinkSync(files[0].path);
      Logger.debug('Agent : Workspace ZIP deleted:', files[0].path);
    }

    await indexFiles(agent.id, files);

    // Update workspace state using the already computed state
    const newState: WorkspaceState = {
      state_hash: hash.md5,
      file_hashes: hash.fileHashes,
      path: workspace,
      agent_id: agent.id,
    };
    writeWorkspaceState(newState);
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
      // Do nothing on purpose
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
    const res = await parseStreamedResponse(agentResponse);
    if (res.actions.length) actions = res.actions;
    if (res.message) queryResponse = res.message;
  } else {
    if (agentResponse.actions) actions = agentResponse.actions;
    if (agentResponse.response) queryResponse = agentResponse.response;
  }

  // Completion is a special action that is used to indicate that the task is completed.
  const completion = actions.find((a) => a.function === 'task_completed');
  if (completion) {
    return [
      actions.filter((a) => a.function !== 'task_completed'),
      completion.args.response || 'Task completed.',
    ];
  }

  return [actions, queryResponse];
};

export const queryCommand = async (
  query: string,
  options: QueryOptions
): Promise<void> => {
  Logger.debug('Options:', options);

  const context = {
    command: query,
    taskId: options.taskId,
    workspacePath: options.workspace,
    agentId: options.agentId,
  };

  Logger.debug('Context:', context);

  updateContext(context);

  try {
    const configManager = ConfigManager.instance;
    const resolvedWorkspace = resolveWorkspacePath(options);
    Logger.debug('Workspace:', resolvedWorkspace);

    const stream = options.stream ?? configManager.get('stream') ?? true;

    ////////// Agent Init //////////
    const { agentConfig, workspaceChanged } = await initializeAgentConfig(
      resolvedWorkspace,
      options
    );

    // If not agent is eligible, it usually means there was an error during the init process that is already displayed.
    if (!agentConfig) {
      return;
    }

    if (agentConfig.remote_exec?.enabled) {
      RemoteExecutor.instance.init(agentConfig.remote_exec);
    }

    ////////// Workflow start //////////
    let taskId = options.taskId;
    if (!taskId) {
      const taskResult = await createTask(agentConfig.id, query);
      taskId = taskResult.id;
    }

    Logger.debug('Task ID:', taskId);

    const workspaceData = getDirectoryMd5Hash({
      directoryPath: resolvedWorkspace,
    });

    /**
     * A plain text list with forward slashes, one file per line.
     * This appears to be the optimal format for an LLM agent to process.
     */
    const workspaceTree = Array.from(workspaceData.fileHashes.keys()).join(
      ' \n '
    );

    const agentManager = new AgentManager({
      workspace: resolvedWorkspace,
      agentConfig,
    });
    logger.start('Thinking');
    const agentResponse = await queryAgent(
      agentManager.agentConfig.id,
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

      // If there are normal actions to execute, process them and submit their outputs to the backend.
      // Then, parse the engine's response for the next set of actions and continue the loop.
      const toolOutputs = await executeActions(actions, agentManager);
      logger.start('Reviewing the job');
      const submitResponse = await submitToolOutputs(
        agentManager.agentConfig.id,
        taskId,
        toolOutputs,
        stream
      );
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
    logger.stop('Query execution error', 1);
    throw error;
  }
};
