import Logger from '../utils/logger';
import { FunctionAction, StreamEvent } from '../utils/types';
import { CHUNK_MESSAGE_CLEAR } from '../utils/messaging';
import chalk from 'chalk';
import { getFunctionArgs, getFunctionName } from '../utils/actions';
import path from 'path';

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
          nextParseIndex = i + 1;
        } catch {
          // Handle parsing error if necessary
          throw new Error(`Error parsing chunked message: '${chunk}'`);
        }
      }
    } else if (
      input[i] === skipDelimiters[0][0] &&
      input.slice(i, i + skipDelimiters[0].length) === skipDelimiters[0]
    ) {
      // skip to the end of the delimiter
      const end = input.indexOf(skipDelimiters[1], i);
      if (end > 0) {
        i = end + skipDelimiters[1].length;
      } else {
        // if the end is not found, maybe the next chunk will have the end
      }
    }
  }

  const remaining = input.slice(nextParseIndex);
  return { parsed: result, remaining };
}

function toItalic(text: string): string {
  return chalk.italic.gray(text.trim());
}

/*
 * Get the italic postfix for the action. Ex: `${taskTitle} : (Updating file: ...)`
 */
export function getActionPostfix(action: FunctionAction): string {
  const functionName = getFunctionName(action);
  const args = getFunctionArgs(action);

  switch (functionName) {
    case 'read_file':
      return toItalic(` (Reading file: ${path.basename(args.path)})`);
    case 'write_file':
      return toItalic(` (Writing to file: ${path.basename(args.path)})`);
    case 'update_file':
      return toItalic(` (Updating file: ${path.basename(args.path)})`);
    case 'run_shell':
      // avoid displaying the full cd command.
      const formatted =
        args.command.startsWith('cd') && args.command.indexOf('&&') > 0
          ? (args.command as string)
              .split('&&')
              .slice(args.command.indexOf('&&') + 1)
          : args.command;
      return toItalic(` (Executing command: ${formatted})`);
    case 'browse_url':
      return toItalic(` (Browsing URL: ${args.url})`);
    default:
      return '';
  }
}

export function getSubActionMessage(
  message: string,
  action: FunctionAction
): string {
  // @todo maybe reactivate after tests
  let actionMsg = `${message}\n   `;
  const functionName = getFunctionName(action);
  const args = getFunctionArgs(action);

  Logger.debug('Args', args);

  switch (functionName) {
    case 'read_file':
      actionMsg += toItalic(`└ File read: ${args.path}`);
      break;
    case 'write_file':
      actionMsg += toItalic(`└ File written: ${args.path}`);
      break;
    case 'update_file':
      actionMsg += toItalic(`└ File updated: ${args.path}`);
      break;
    case 'run_shell':
      actionMsg += toItalic(`└ Command executed: ${args.command}`);
      break;
    case 'browse_url':
      actionMsg += toItalic(`└ URL browsed: ${args.url}`);
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

// Skip the stream chunk parsing when the following delimiters are found in the content (which can break the parsing)
export const UPDATE_FILE_DELIMITERS: [string, string] = ['<<<<<', '>>>>>'];

export async function processStreamedResponse(
  agentResponse: AsyncIterable<Buffer>
) {
  const actions: FunctionAction[] = [];
  let message = '';

  let chunks: string[] = [];

  for await (const chunk of agentResponse) {
    let content = '';
    let streamEvents: StreamEvent[];

    //If there were previous chunks, we need to add them
    chunks.push(chunk.toString('utf-8'));

    if (chunks.length > 0) {
      content = chunks.join('');
    } else {
      content = Buffer.from(chunk).toString('utf8');
    }
    try {
      streamEvents = [JSON.parse(content)];
      chunks = [];
    } catch (e) {
      // Chunks might come in multiple parts
      const { parsed, remaining } = parseChunkedMessages<StreamEvent>(
        content,
        UPDATE_FILE_DELIMITERS
      );

      // Logger.debug('Parsed:', parsed);

      if (remaining) {
        // Logger.debug('Remaining:', remaining);
        chunks = [remaining];
      } else {
        chunks = [];
      }
      streamEvents = parsed;
    }

    streamEvents.forEach((streamEvent) => {
      Logger.debug('StreamEvent', streamEvent);
      switch (streamEvent.status) {
        case 'requires_action':
          // The default message is too verbose, for now we will just display the actions
          // if (streamEvent.message !== DEFAULT_ACTIONS_REPONSE.message) {
          //   message = streamEvent.message;
          // } else {
          //   message = '';
          // }
          message = '';
          actions.push(...(streamEvent.actions ?? []));
          // logger.message(streamEvent.message);
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
        // logger.message(streamEvent.message);
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
