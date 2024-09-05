import { marked, MarkedExtension } from 'marked';
import { markedTerminal } from 'marked-terminal';
import axios, { AxiosError } from 'axios';
import { jsonrepair } from 'jsonrepair';

import { AgentManager } from '../managers/agentManager';

import { getEligibleAgents } from '../utils/conf';
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
  processStreamedResponse,
  isStreamingContext,
} from '../helpers/streams';
import {
  getWorkspaceChanges,
  synchroniseWorkspaceChanges,
} from '../helpers/workspace';

import { initCommand } from './init';

marked.use(markedTerminal() as MarkedExtension);
const isDebug = process.env.DEBUG === 'true';

async function initializeAgentConfig(workspace: string, skipWarmup: boolean) {
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
    const workspace = !options.workspace ? process.cwd() : options.workspace;
    const skipWarmup = !!options.skipWarmup;
    const stream = !!options.stream;

    const logger = new Logger();

    const eligible = await initializeAgentConfig(workspace, skipWarmup);

    const agentManager = new AgentManager({
      id: eligible.id,
      name: eligible.name,
      engine: eligible.engine,
      workspace,
    });

    let changedWorkspace = false;
    if (eligible && !skipWarmup) {
      const workspaceDiff = await getWorkspaceChanges(workspace);
      changedWorkspace = workspaceDiff.hasChanges;
      if (workspaceDiff.hasChanges) {
        logger.start('Synchronizing workspace');
        await synchroniseWorkspaceChanges(eligible.id, workspace);
        logger.stop('Workspace synchronized');
      }
    }
    // Pre-check agent status
    if (agentManager.engine.includes('openai')) {
      const statusReponse = await getAgentStatus(agentManager.id);
      if (
        statusReponse?.status === 'in_progress' ||
        statusReponse?.status === 'requires_action'
      ) {
        Logger.debug('Agent status:', statusReponse.status);
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

    if (isStreamingContext(stream, agentResponse)) {
      const res = await processStreamedResponse(agentResponse, logger);
      logger.stop('Done processing');
      if (res.actions.length) {
        actions = res.actions;
      }
      if (res.message) {
        Logger.agent(res.message);
      }
    } else {
      logger.message(agentResponse.response || query);
      Logger.debug('Agent response:', agentResponse);

      if (agentResponse.asynchronous) {
        const status = await agentManager.checkStatus();
        if (status?.actions) {
          actions = status.actions;
        }
      }

      if (agentResponse.response) {
        Logger.agent(agentResponse.response);
        logger.message(agentResponse.response);
      }

      logger.stop('Done processing');
    }

    // WHILE
    while (actions?.length) {
      const toolOutputs: any[] = [];
      for (const action of actions) {
        let args: any;

        if (action.function.arguments) {
          args = action.function.arguments;
          if (typeof args === 'string') {
            const fixed_args = jsonrepair(args);
            args = JSON.parse(convertFormToJSON(fixed_args));
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

      actions = [];

      logger.start('Reviewing the job');
      // if (!agentManager.engine.includes('openai') && toolOutputs?.length) {
      //   const query = `
      //     Find below the output of the actions in the task context, if you're done on the main task and its related subtasks, you can stop and wait for my next instructions.
      //     Output :
      //     ${toolOutputs?.map((o: { output: string }) => o.output).join('\n')}`;
      //
      //   await queryCommand(query, options);
      //   return;
      // }

      // For now only openai engine supports this
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
        const res = await processStreamedResponse(submitReponse, logger);
        if (res.actions.length) {
          actions = res.actions;
        }
        logger.stop();
        if (res.message) {
          Logger.agent(res.message);
        }
      } else if (submitReponse) {
        Logger.debug('Standard mode');

        if ((agentResponse as QueryResponseDTO).asynchronous) {
          // Standard status polling mode
          const statusResponse = await agentManager.checkStatus();
          if (statusResponse?.actions?.length) {
            actions = statusResponse.actions;
          }
        }
        logger.stop('Job reviewed');
      }
    }
    // WHILE END
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
