import { jsonrepair } from 'jsonrepair';
import { ListrTask, ListrTaskWrapper } from 'listr2';
import { convertFormToJSON } from '../utils/json';
import { Logger } from '../utils/logger';
import { TaskCtx } from '../commands/query';

export function getActionTaskList(
  ctx: TaskCtx,
  parentTask: ListrTaskWrapper<TaskCtx, any, any>
): ListrTask<TaskCtx>[] | null {
  if (!ctx.agentResponse?.actions) {
    return null;
  }
  return ctx.agentResponse.actions.map((action) => {
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

    return {
      task: async (ctx) => {
        if (!ctx.agentManager) {
          throw new Error('No agent manager found');
        }
        parentTask.title = taskTitle;
        // subtask.output = taskTitle || action.function.arguments;
        const toolOutput = await ctx.agentManager.executeAction(action, args);
        Logger.debug('Tool output2:', toolOutput);
        if (!ctx.toolOutputs) {
          ctx.toolOutputs = [];
        }
        ctx.toolOutputs.push(toolOutput);
      },
    };
  });
}
