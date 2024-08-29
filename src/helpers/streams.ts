import { ListrTaskWrapper } from 'listr2';
import { FunctionAction } from './api';
import { StreamEvent } from '../utils/openaiThreads';
import { TaskCtx } from '../commands/query';

export async function processStreamedResponse(
  agentResponse: AsyncIterable<Buffer>,
  task: ListrTaskWrapper<TaskCtx, any, any>
) {
  let actions: FunctionAction[] = [];

  for await (const chunk of agentResponse) {
    const content = Buffer.from(chunk).toString('utf8');
    let streamEvent: StreamEvent;
    // Logger.debug('Stream content:', content);
    try {
      streamEvent = JSON.parse(content);
    } catch (e) {
      continue;
      // Sometimes the stream is not a valid JSON
    }
    // streamEvent.event != 'thread.message.delta' &&
    //   streamEvent.event != 'thread.run.step.delta' &&
    // Logger.debug('Stream event:', { event: streamEvent.event });
    switch (streamEvent.event) {
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
        task.output = 'Thinking..';
        break;
      case 'thread.run.requires_action':
        task.output = 'Talking to your machine..';
        break;
      default:
        task.output = 'Mmmh...';
        break;
    }

    if (streamEvent.event === 'thread.run.requires_action') {
      actions = streamEvent.data.required_action.submit_tool_outputs.tool_calls;
      // try {
      //   task.output = JSON.parse(actions[0].function.arguments || '{}').answer;
      //   if (!task.output) {
      //     Logger.debug('Undefined answer for actions:', { actions });
      //     task.output = '...';
      //   }
      // } catch (e) {}
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
