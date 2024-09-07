import { FunctionAction } from './api';
import Logger from '../utils/logger';
import { StreamEvent } from '../utils/types';
import { CHUNK_MESSAGE_CLEAR } from '../utils/messaging';

/**
 * Parse the chunks of messages from the agent response,
 * and return the parsed messages and the remaining content
 */
function parseChunkedMessages<T>(input: string): {
  parsed: T[];
  remaining: string;
} {
  const result: T[] = [];
  const stack: string[] = [];
  let startIndex = 0;
  let lastParsedIndex = 0;

  for (let i = 0; i < input.length; i++) {
    if (input[i] === '{') {
      if (stack.length === 0) {
        startIndex = i;
      }
      stack.push('{');
    } else if (input[i] === '}') {
      stack.pop();
      if (stack.length === 0) {
        const chunk = input.slice(startIndex, i + 1);
        try {
          result.push(JSON.parse(chunk));
          lastParsedIndex = i + 1;
        } catch {
          // Handle parsing error if necessary
        }
      }
    }
  }

  const remaining = input.slice(lastParsedIndex);
  return { parsed: result, remaining };
}

export async function processStreamedResponse(
  agentResponse: AsyncIterable<Buffer>,
  logger: Logger
) {
  const actions: FunctionAction[] = [];
  let message = '';

  let chunks: Buffer[] = [];

  for await (const chunk of agentResponse) {
    let content = '';
    if (chunks.length > 0) {
      chunks.push(chunk);
      content = Buffer.concat(chunks).toString('utf8');
    } else {
      content = Buffer.from(chunk).toString('utf8');
    }
    // Logger.debug('Streamed data:', content);

    let streamEvents: StreamEvent[];
    try {
      streamEvents = [JSON.parse(content)];
      chunks = [];
    } catch (e) {
      // TODO: test this in staging environment !!!!!!!!!!!!!!!!
      // Logger.debug('Error parsing stream content:', e);
      // Chunks might come in multiple parts
      const toParse = chunks.map((b) => b.toString('utf-8')).join('') + content;
      const { parsed, remaining } = parseChunkedMessages<StreamEvent>(toParse);

      if (remaining) {
        // Logger.debug('Remaining:', remaining);
        chunks = [Buffer.from(remaining)];
      } else {
        chunks = [];
      }
      streamEvents = parsed;
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
    streamEvents.forEach((streamEvent) => {
      // Logger.debug('StreamEvent', streamEvent);
      switch (streamEvent.status) {
        case 'requires_action':
          message = '';
          actions.push(...(streamEvent.actions ?? []));
          logger.message(streamEvent.message);
          break;
        case 'message':
          message = streamEvent.message;
          break;
        case 'chunked_message':
          // Clearing the buffer in case the Agent sends noise...
          if (streamEvent.message.includes(CHUNK_MESSAGE_CLEAR)) {
            message = streamEvent.message.replace(CHUNK_MESSAGE_CLEAR, '');
          } else {
            message += streamEvent.message;
          }

          // TODO: this displays the live stream but it's broken with clack.. Displaying on multiple lines will break...
          // if (message) {
          //   logger.message(message);
          // }
          break;
        default:
          logger.message(streamEvent.message);
      }
    });
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
