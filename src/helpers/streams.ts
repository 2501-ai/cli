import { FunctionAction } from './api';
import Logger from '../utils/logger';
import { StreamEvent } from '../utils/types';

export async function processStreamedResponse(
  agentResponse: AsyncIterable<Buffer>,
  logger: Logger
) {
  const actions: FunctionAction[] = [];
  let message = '';
  let chunks: Buffer[] = [];

  for await (const chunk of agentResponse) {
    let content: string;
    if (chunks.length > 0) {
      chunks.push(chunk);
      content = Buffer.concat(chunks).toString('utf8');
    } else {
      content = Buffer.from(chunk).toString('utf8');
    }

    Logger.debug('Content:', content);

    let streamEvent: StreamEvent;
    try {
      streamEvent = JSON.parse(content);
      chunks = [];
    } catch (e) {
      // Logger.debug('Error parsing stream content:', e);
      // TODO: test this in staging environment
      // Chunks might come in multiple parts
      chunks.push(chunk);
      Logger.debug(
        'Total Chunk content:',
        Buffer.concat(chunks).toString('utf8')
      );
      continue;
    }

    // @todo maybe reactivate after tests
    // let actionMsg = 'Taking action(s) :';

    // The action event can come in multiple chunks
    // if (content.includes('thread.run.requires_action')) {
    //   actionEventRaw += content;
    // streamEvent.data.required_action.submit_tool_outputs.tool_calls;

    // actions.forEach((action) => {
    //   switch (action.function.name as keyof typeof ACTION_FNS) {
    //     case 'read_file':
    //       actionMsg += `\n  - Reading file: ${JSON.parse(action.function.arguments).path}`;
    //       break;
    //     case 'write_file':
    //       actionMsg += `\n  - Writing to file: ${JSON.parse(action.function.arguments).path}`;
    //       break;
    //     // case 'apply_diff':
    //     //   actionMsg += `\n  - Applying diff to file: ${JSON.parse(action.function.arguments).path}`;
    //     //   break;
    //     case 'update_file':
    //       actionMsg += `\n  - Updating file: ${JSON.parse(action.function.arguments).path}`;
    //       break;
    //     case 'run_shell':
    //       actionMsg += `\n  - Running shell command: ${JSON.parse(action.function.arguments).command}`;
    //       break;
    //     case 'browse_url':
    //       actionMsg += `\n  - Browsing URL: ${action.args.url}`;
    //       break;
    //     default:
    //       actionMsg += `\n- ${action.function.name}`;
    //   }
    // });
    // }

    switch (streamEvent.status) {
      case 'requires_action':
        actions.push(...(streamEvent.actions ?? []));
        logger.message(streamEvent.message);
        break;
      case 'message':
        message = streamEvent.message;
        break;
      default:
        logger.message(streamEvent.message);
    }
  }

  // Logger.debug('Actions:', actions);
  return { actions, message };
}

/**
 * Method to infer the correct type of the agent response
 */
export function isStreamingContext<T>(
  stream: boolean,
  agentResponse: T | AsyncIterable<Buffer>
): agentResponse is AsyncIterable<Buffer> {
  return stream && !!agentResponse;
}
