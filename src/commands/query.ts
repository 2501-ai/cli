import { marked, MarkedExtension } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { ListrTask } from 'listr2';

import { TaskManager } from '../managers/taskManager';
import { AgentConfig, getEligibleAgents } from '../utils/conf';

import { getInitTaskList } from './init';
import { AgentManager } from '../managers/agentManager';
import { Logger } from '../utils/logger';
import { synchroniseWorkspaceChanges } from '../helpers/workspace';
import { FunctionAction, queryAgent, submitToolOutputs } from '../helpers/api';
import { getActionTaskList } from '../tasks/actions';
import {
  isStreamingContext,
  processStreamedResponse,
} from '../helpers/streams';

marked.use(markedTerminal() as MarkedExtension);
const isDebug = process.env.DEBUG === 'true';

export type TaskCtx = {
  actions: FunctionAction[];
  asynchronous: boolean;
  workspace: string;
  query: string;
  stream: boolean;

  // Optional properties
  skipWarmup: boolean;
  agentId?: string;
  agentManager?: AgentManager;
  changed?: boolean;
  eligible?: AgentConfig | null;
  toolOutputs?: any[];
};

const initWorkspaceTask: ListrTask<TaskCtx> = {
  rendererOptions: {
    collapseSubtasks: true,
  },
  task: async (ctx, task) => {
    // subtask.title = 'Syncing..';
    ctx.eligible = getEligibleAgents(ctx.agentId, ctx.workspace);
    // initialize agent if not found
    if (!ctx.eligible && !ctx.skipWarmup) {
      task.title = 'Initializing workspace..';
      // return TaskManager.addTask(getInitTaskList({ workspace }))
      return task.newListr(getInitTaskList({ workspace: ctx.workspace }), {
        exitOnError: true,
      });
    }
  },
};

const initAgentTask: ListrTask<TaskCtx> = {
  // title: 'Syncing workspace..',
  task: async (ctx, task) => {
    ctx.eligible = getEligibleAgents(ctx.agentId, ctx.workspace);
    if (!ctx.eligible) {
      throw new Error('No agent found');
    }

    task.output = `Using agent: (${ctx.eligible.id})`;

    const agentManager = new AgentManager({
      id: ctx.eligible.id,
      name: ctx.eligible.name,
      engine: ctx.eligible.engine,
      workspace: ctx.workspace,
    });
    ctx.agentManager = agentManager;
    ctx.changed = await synchroniseWorkspaceChanges(
      agentManager.id,
      ctx.workspace
    );
    if (ctx.changed) {
      task.title = `Workspace synchronised`;
    }
  },
};

const queryAgentTask: ListrTask<TaskCtx> = {
  task: async (ctx, task) => {
    if (ctx.changed === undefined) {
      throw new Error('Workspace not synchronized');
    }
    if (!ctx.agentManager) {
      throw new Error('AgentManager not initialized');
    }

    task.title = 'Working...';
    Logger.debug('Querying agent..', ctx.agentManager.id);
    const agentResponse = await queryAgent(
      ctx.agentManager.id,
      ctx.changed,
      ctx.query,
      ctx.stream
    );

    if (isStreamingContext(ctx, agentResponse)) {
      ctx.actions = await processStreamedResponse(agentResponse, task);
      return;
    }

    task.title = agentResponse.response || task.title;

    if (agentResponse.asynchronous) {
      ctx.asynchronous = true;
      const status = await ctx.agentManager.checkStatus();
      if (status?.actions) {
        agentResponse.actions = status.actions;
      }
    }

    if (agentResponse.response) {
      Logger.agent(agentResponse.response);
      task.title = agentResponse.response;
    }
  },
};

const finalReviewTask: ListrTask<TaskCtx> = {
  title: 'Waiting for previous command to finish..',
  task: async (ctx, task) => {
    if (!ctx.agentManager) {
      throw new Error('Context not initialized');
    }

    if (!ctx.toolOutputs?.length) {
      task.title = 'No command left to verify.';
      return;
    }

    task.title = 'Reviewing..';
    if (!ctx.asynchronous && !ctx.stream) {
      ctx.query = `
          Find below the output of the actions in the task context, if you're done on the main task and its related subtasks, you can stop and wait for my next instructions.
          Output :
          ${ctx.toolOutputs.map((o: { output: string }) => o.output).join('\n')}`;
      return task.newListr([queryAgentTask], {
        exitOnError: true,
      });
    }

    try {
      // Logger.debug('Submitting tool outputs..', {
      //   agentId: ctx.agentManager.id,
      //   toolCallIds: ctx.toolOutputs.map((o) => o.tool_call_id),
      //   stream: ctx.stream,
      // });
      const submitReponse = await submitToolOutputs(
        ctx.agentManager.id,
        ctx.toolOutputs,
        ctx.stream
      );
      // Reset toolOutputs after submition to OpenAI
      ctx.toolOutputs = [];

      // Streaming mode
      if (isStreamingContext(ctx, submitReponse)) {
        ctx.actions = await processStreamedResponse(submitReponse, task);
      } else {
        // Standard status polling mode
        const statusResponse = await ctx.agentManager.checkStatus();
        if (!statusResponse?.actions?.length) {
          // subtask.title = 'No additional steps to make.';
          Logger.debug('No additional steps found');
          return;
        }

        ctx.actions = statusResponse.actions;
      }

      const tasks = getActionTaskList(ctx, task);
      if (tasks.length) {
        return task.newListr(tasks.concat([finalReviewTask]), {
          exitOnError: true,
        });
      }
      task.title = 'No additional steps to make.';
    } catch (e) {
      Logger.error('Submition Error', e);
      // await ctx.agentManager.checkStatus();
    }
  },
};

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

    await TaskManager.run<TaskCtx>(
      [
        initWorkspaceTask,
        initAgentTask,
        queryAgentTask,
        {
          task: async (ctx, task) => {
            const tasks = getActionTaskList(ctx, task);
            if (tasks.length) {
              return task.newListr(tasks.concat([finalReviewTask]), {
                exitOnError: true,
              });
            }
          },
        },
      ],
      {
        ctx: {
          ...options,
          workspace,
          query,
          stream,
          skipWarmup,
          actions: [],
          asynchronous: false,
        },
        concurrent: false,
        exitOnError: true,
        rendererOptions: {
          indentation: 0,
          collapseSubtasks: false,
        },
      }
    );
  } catch (e) {
    if (isDebug) {
      Logger.error('Command error', e);
    } else {
      Logger.error('Something bad happened 🥲', (e as Error).message);
    }
    process.exit(1);
  }
}
