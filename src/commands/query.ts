import axios from 'axios';
import { marked, MarkedExtension } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { ListrTask } from 'listr2';

import { TaskManager } from '../managers/taskManager';
import { AgentConfig, getEligibleAgents, readConfig } from '../utils/conf';
import { API_HOST, API_VERSION } from '../constants';

import { getInitTaskList } from './init';
import { AgentManager } from '../managers/agentManager';
import { Logger } from '../utils/logger';
import { synchroniseWorkspaceChanges } from '../helpers/workspace';
import { queryAgent, QueryResponseDTO } from '../helpers/api';
import { getActionTaskList } from '../tasks/actions';
import { StreamEvent } from '../utils/openaiThreads';

marked.use(markedTerminal() as MarkedExtension);
const isDebug = process.env.DEBUG === 'true';

export type TaskCtx = {
  streamState?: { requiresAction: boolean; runId: any };
  workspace: string;
  query: string;
  stream: boolean;

  // Optional properties
  skipWarmup: boolean;
  callback?: (...args: any[]) => Promise<void>;
  agentId?: string;
  agentResponse?: QueryResponseDTO;
  agentManager?: AgentManager;
  changed?: boolean;
  eligible?: AgentConfig | null;
  toolOutputs?: any[];
};

export type StreamDataProgress = {
  // Thinking
  event: 'thread.run.in_progress';
  data: {
    id: 'run_kUVRtHZoireWqPWl30zaHzXF';
    object: 'thread.run';
    created_at: 1724858198;
    assistant_id: 'asst_XTeZFklGdmpgfMWdLTDlXasU';
    thread_id: 'thread_ND2Iwo0OH9BbXwQnsaixNccD';
    status: 'in_progress';
    started_at: 1724858199;
    expires_at: 1724858798;
    cancelled_at: null;
    failed_at: null;
    completed_at: null;
    required_action: null;
    last_error: null;
    model: 'gpt-4o';
    instructions: string;
    tools: [];
    tool_resources: { code_interpreter: { file_ids: [] } };
    metadata: any;
    temperature: 0.1;
    top_p: 1;
    max_completion_tokens: null;
    max_prompt_tokens: null;
    truncation_strategy: { type: 'auto'; last_messages: null };
    incomplete_details: null;
    usage: null;
    response_format: 'auto';
    tool_choice: 'auto';
    parallel_tool_calls: true;
  };
};

export type StreamData = {
  event: 'thread.run.step.delta';
  data: {
    id: 'step_za4PzcFe7wtflmEhi9WgsS0c';
    object: 'thread.run.step.delta';
    delta: {
      step_details: {
        type: 'tool_calls';
        tool_calls: [
          { index: 0; type: 'function'; function: { arguments: ' /' } },
        ];
      };
    };
  };
};
export type Events =
  | 'thread.run.queued' // Starting..
  | 'thread.run.step.created' // Making a step further..
  | 'thread.run.in_progress' // Progressing..
  | 'thread.run.step.delta'; // Finalizing..

export type StreamDataCreated = {
  event: 'thread.run.step.created';
  data: {
    id: 'step_EzRadR2G6DtweYA4h3neSeHw';
    object: 'thread.run.step';
    created_at: 1724858202;
    run_id: 'run_kUVRtHZoireWqPWl30zaHzXF';
    assistant_id: 'asst_XTeZFklGdmpgfMWdLTDlXasU';
    thread_id: 'thread_ND2Iwo0OH9BbXwQnsaixNccD';
    type: 'tool_calls';
    status: 'in_progress';
    cancelled_at: null;
    completed_at: null;
    expires_at: 1724858798;
    failed_at: null;
    last_error: null;
    step_details: { type: 'tool_calls'; tool_calls: [] };
    usage: null;
  };
};

export type StreamDataCompleted = {
  event: 'thread.run.requires_action';
  data: {
    id: 'run_kUVRtHZoireWqPWl30zaHzXF';
    object: 'thread.run';
    created_at: 1724858198;
    assistant_id: 'asst_XTeZFklGdmpgfMWdLTDlXasU';
    thread_id: 'thread_ND2Iwo0OH9BbXwQnsaixNccD';
    status: 'requires_action';
    started_at: 1724858199;
    expires_at: 1724858798;
    cancelled_at: null;
    failed_at: null;
    completed_at: null;
    required_action: {
      type: 'submit_tool_outputs';
      submit_tool_outputs: {
        tool_calls: [
          {
            id: 'call_GKakN8L4YA9pb6Wpvd7wz3OR';
            type: 'function';
            function: {
              name: 'run_shell';
              arguments: '{\n  "answer": "Compiling the TypeScript code to verify if it compiles without errors.",\n  "command": "cd /private/tmp/2501-workspace && npm run build"\n}';
            };
          },
        ];
      };
    };
    last_error: null;
    model: 'gpt-4o';
    instructions: string;
    tools: [];
    tool_resources: { code_interpreter: { file_ids: [] } };
    metadata: any;
    temperature: 0.1;
    top_p: 1;
    max_completion_tokens: null;
    max_prompt_tokens: null;
    truncation_strategy: { type: 'auto'; last_messages: null };
    incomplete_details: null;
    usage: null;
    response_format: 'auto';
    tool_choice: 'auto';
    parallel_tool_calls: true;
  };
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
      callback: ctx.callback,
      workspace: ctx.workspace,
      queryCommand,
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

    task.title = 'Thinking...';
    Logger.debug('Querying agent..', ctx.agentManager.id);
    ctx.agentResponse = await queryAgent(
      ctx.agentManager.id,
      ctx.changed,
      ctx.query,
      ctx.stream
    );

    if (ctx.stream) {
      for await (const chunk of ctx.agentResponse as unknown as AsyncIterable<Buffer>) {
        try {
          const event: StreamEvent = JSON.parse(chunk.toString('utf8'));
          // Logger.debug(event);
          switch (event.event) {
            case 'thread.run.queued':
              task.output = 'Starting..';
              break;
            // case 'thread.run.step.created':
            //   task.output = 'Making a step further..';
            //   break;
            case 'thread.run.in_progress':
            case 'thread.run.step.in_progress':
              task.output = 'Progressing..';
              break;
            case 'thread.run.step.delta':
              task.output = 'Finalizing..';
              break;
            default:
              task.output = 'Thinking...';
              break;
          }

          if (event.event === 'thread.run.requires_action') {
            const actions =
              event.data.required_action.submit_tool_outputs.tool_calls;
            task.output = JSON.parse(
              actions[0].function.arguments || '{}'
            ).answer;
            ctx.agentResponse = {
              response: 'Requires action',
              asynchronous: false,
              actions,
            };
            ctx.streamState = {
              requiresAction: true,
              runId: event.data.id,
            };
          }
        } catch (e) {
          Logger.error('Parsing error', e);
          throw e;
        }
      }
    }

    task.title = ctx.agentResponse.response || task.title;

    if (ctx.agentResponse.asynchronous) {
      const status = await ctx.agentManager.checkStatus();
      if (status?.actions) {
        ctx.agentResponse.actions = status.actions;
      }
    }

    if (ctx.agentResponse.response) {
      Logger.agent(ctx.agentResponse.response);
      task.title = ctx.agentResponse.response;
    }
  },
};

const finalCheck: ListrTask<TaskCtx> = {
  task: async (ctx, task) => {
    if (!ctx.agentManager || !ctx.agentResponse) {
      throw new Error('Context not initialized');
    }
    if (
      ctx.agentManager.engine.includes('rhino') &&
      ctx.agentResponse.actions
    ) {
      try {
        const config = readConfig();
        await axios.post(
          `${API_HOST}${API_VERSION}/agents/${ctx.agentManager.id}/submitOutput`,
          {
            tool_outputs: ctx.toolOutputs,
            runId: ctx.streamState?.runId,
          },
          {
            headers: {
              Authorization: `Bearer ${config?.api_key}`,
            },
          }
        );

        // Reset toolOutputs after submition to OpenAI
        ctx.toolOutputs = [];
        Logger.debug('Final check : Output submitted');
        // add a 2 sec delay
        // await new Promise((resolve) => setTimeout(resolve, 2000));
        // retry
        // subtask.output = 'Checking status...';
        const statusResponse = await ctx.agentManager.checkStatus();
        if (statusResponse?.actions) {
          ctx.agentResponse.actions = statusResponse.actions;

          task.title = `Running ${ctx.agentResponse.actions?.length ?? 0} additional step(s)`;
          const tasks = getActionTaskList(ctx, task);
          if (tasks) {
            return task.newListr(tasks.concat([finalCheck]), {
              exitOnError: true,
            });
          } else {
            Logger.debug('No tasks found');
          }
        } else {
          // subtask.title = 'No additional steps to make.';
          Logger.debug('No additional steps found');
        }
      } catch (e) {
        Logger.error(e);
        await ctx.agentManager.checkStatus();
      }
    } else {
      if (!ctx.toolOutputs) {
        ctx.toolOutputs = [];
      }
      ctx.query = `
          Find below the output of the actions in the task context, if you're done on the main task and its related subtasks, you can stop and wait for my next instructions.
          Output :
          ${ctx.toolOutputs.map((o: { output: string }) => o.output).join('\n')}`;
      return task.newListr(getQueryTaskList(), {
        exitOnError: true,
      });
    }
  },
};

export function getQueryTaskList(): ListrTask<TaskCtx>[] {
  return [
    initWorkspaceTask,
    initAgentTask,
    queryAgentTask,
    {
      task: async (ctx, task) => {
        const tasks = getActionTaskList(ctx, task);
        if (tasks) {
          return task.newListr(tasks.concat([finalCheck]), {
            exitOnError: true,
          });
        }
      },
    },
  ];
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

    await TaskManager.run<TaskCtx>(getQueryTaskList(), {
      ctx: { ...options, workspace, query, stream, skipWarmup },
      concurrent: false,
      exitOnError: true,
      collectErrors: 'full',
      rendererOptions: {
        indentation: 0,
        collapseSubtasks: false,
      },
    });
  } catch (e) {
    if (isDebug) {
      Logger.error('Command error', e);
    } else {
      Logger.error('Something bad happened 🥲', (e as Error).message);
    }
  }
}
