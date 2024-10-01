import { FunctionAction } from './api';
import Logger from '../utils/logger';
import { StreamEvent } from '../utils/types';
import { CHUNK_MESSAGE_CLEAR } from '../utils/messaging';
import chalk from 'chalk';
import { getFunctionArgs, getFunctionName } from '../utils/actions';

/**
 * Parse the chunks of messages from the agent response,
 * and return the parsed messages and the remaining content
 *
 * @param input
 * @param skipDelimiters - Skip parsing between delimiters. Ex: ['<<<<<', '>>>>>']
 */
export function parseChunkedMessages<T>(
  input: string,
  skipDelimiters: [string, string]
): {
  parsed: T[];
  remaining: string;
} {
  // Logger.debug('Parsing chunked messages:', input);
  const result: T[] = [];
  const stack: string[] = [];
  let startIndex = 0;
  let nextParseIndex = 0;
  let skip = false;
  let skipStart = '';
  let skipEnd = '';

  for (let i = 0; i < input.length; i++) {
    if (input[i] === '{' && !skip) {
      if (stack.length === 0) {
        startIndex = i;
      }
      stack.push('{');
    } else if (input[i] === '}' && !skip) {
      stack.pop();
      if (stack.length === 0) {
        const chunk = input.slice(startIndex, i + 1);
        try {
          result.push(JSON.parse(chunk));
          nextParseIndex = i + 1;
        } catch {
          // Handle parsing error if necessary
          throw new Error('Error parsing chunked messages');
        }
      }
    } else if (input[i] === skipDelimiters[0][skipStart.length]) {
      skipStart += input[i];
      if (skipStart === skipDelimiters[0]) {
        skip = true;
        skipStart = '';
      }
    } else if (input[i] === skipDelimiters[1][skipEnd.length]) {
      skipEnd += input[i];
      if (skipEnd === skipDelimiters[1]) {
        skip = false;
        skipEnd = '';
      }
    }
  }

  const remaining = input.slice(nextParseIndex);
  return { parsed: result, remaining };
}

function toItalic(text: string): string {
  return chalk.italic.gray(text.trim());
}

export function getSubActionMessage(
  message: string,
  action: FunctionAction
): string {
  // @todo maybe reactivate after tests
  let actionMsg = `${message} : \n   `;
  const functionName = getFunctionName(action);
  const args = getFunctionArgs(action);

  Logger.debug('Args', args);

  switch (functionName) {
    case 'read_file':
      actionMsg += toItalic(`└ Reading file: ${args.path}`);
      break;
    case 'write_file':
      actionMsg += toItalic(`└ Writing to file: ${args.path}`);
      break;
    case 'update_file':
      actionMsg += toItalic(`└ Updating file: ${args.path}`);
      break;
    case 'run_shell':
      actionMsg += toItalic(`└ Executing command: ${args.command}`);
      break;
    case 'browse_url':
      actionMsg += toItalic(`└ Browsing URL: ${args.url}`);
      break;
    default:
      // TODO: find a better way to display the action. Right now it just adds the message indefinitely.
      // actionMsg += toItalic(`  - ${JSON.stringify(action.function)}`);
      actionMsg = message;
  }

  // Logger.debug('SubActionMessage:', actionMsg);
  return actionMsg.trim();
}
// Variable will be availble as long as the process is running
let totalTokens = 0;

export const UPDATE_FILE_DELIMITERS: [string, string] = ['<<<<<', '>>>>>'];

export async function processStreamedResponse(
  agentResponse: AsyncIterable<Buffer>,
  logger: Logger
) {
  const actions: FunctionAction[] = [];
  let message = '';

  let chunks: string[] = [];

  for await (const chunk of agentResponse) {
    let content = '';
    //If there were previous chunks, we need to join them
    chunks.push(chunk.toString('utf-8'));

    if (chunks.length > 0) {
      content = chunks.join('');
    } else {
      content = Buffer.from(chunk).toString('utf8');
    }
    // Logger.debug(`Streamed data [Chunks: ${chunks.length}]:`, content);

    let streamEvents: StreamEvent[];
    try {
      streamEvents = [JSON.parse(content)];
      chunks = [];
    } catch (e) {
      // TODO: test this in staging environment !!!!!!!!!!!!!!!!
      // Logger.debug('Error parsing stream content:', e);
      // Chunks might come in multiple parts
      const { parsed, remaining } = parseChunkedMessages<StreamEvent>(
        content,
        UPDATE_FILE_DELIMITERS
      );

      // Logger.debug('Parsed:', parsed);

      if (remaining) {
        Logger.debug('Remaining:', remaining);
        chunks = [remaining];
      } else {
        chunks = [];
      }
      streamEvents = parsed;
    }

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
        case 'completed':
        case 'failed':
          message = streamEvent.message || `Task ${streamEvent.status}`;
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
        case 'usage':
          if (process.env.SHOW_USAGE) {
            totalTokens += streamEvent.usage?.total_tokens || 0;
            message = `[${totalTokens} tokens used] ${message || streamEvent.message}`;
          }
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
