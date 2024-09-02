import { ListrTaskWrapper } from 'listr2';

import { FunctionAction } from './api';
import { StreamEvent } from '../utils/types';
import { TaskCtx } from '../commands/query';
import { ACTION_FNS } from '../managers/agentManager';

export async function processStreamedResponse(
  agentResponse: AsyncIterable<Buffer>,
  task: ListrTaskWrapper<TaskCtx, any, any>
) {
  let actions: FunctionAction[] = [];

  for await (const chunk of agentResponse) {
    const content = Buffer.from(chunk).toString('utf8');
    let streamEvent: StreamEvent;
    try {
      streamEvent = JSON.parse(content);
    } catch (e) {
      continue;
      // Sometimes the stream is not a valid JSON
    }

    let actionMsg = 'Taking action(s) :';
    if (streamEvent.event === 'requires_action') {
      actions = streamEvent.data.required_action.submit_tool_outputs.tool_calls;
      actions.forEach((action) => {
        switch (action.function.name as keyof typeof ACTION_FNS) {
          case 'read_file':
            actionMsg += `\n  - Reading file: ${JSON.parse(action.function.arguments).path}`;
            break;
          case 'write_file':
            actionMsg += `\n  - Writing to file: ${JSON.parse(action.function.arguments).path}`;
            break;
          // case 'apply_diff':
          //   actionMsg += `\n  - Applying diff to file: ${JSON.parse(action.function.arguments).path}`;
          //   break;
          case 'update_file':
            actionMsg += `\n  - Updating file: ${JSON.parse(action.function.arguments).path}`;
            break;
          case 'run_shell':
            actionMsg += `\n  - Running shell command: ${JSON.parse(action.function.arguments).command}`;
            break;
          case 'browse_url':
            actionMsg += `\n  - Browsing URL: ${action.args.url}`;
            break;
          default:
            actionMsg += `\n- ${action.function.name}`;
        }
      });
    }

    // if (streamEvent.event === 'thread.run.completed') {
    //   Logger.debug('Thread run completed', streamEvent.data);
    // }

    switch (streamEvent.event) {
      case 'in_progress':
        task.output = 'Thinking..';
        break;
      case 'requires_action':
        task.title = actionMsg;
        break;
      case 'failed':
        task.output = 'Task Failed';
        break;
      case 'completed':
        task.output = 'Task Completed';
        break;
    }
  }
  return actions;
}

/**
 * Method to infer the correct type of the agent response
 */
export function isStreamingContext<T>(
  ctx: TaskCtx,
  agentResponse: T | AsyncIterable<Buffer>
): agentResponse is AsyncIterable<Buffer> {
  return ctx.stream;
}
