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
 * The input can contain multiple or partial JSON objects.
 *
 * @param input - String input to be parsed.
 */
export function parseChunkedMessages<T>(input: string): {
  parsed: T[];
  remaining: string;
} {
  const parsed: T[] = [];
  let currentJson = '';
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    currentJson += char;

    // Track if we're within a string
    if (char === '"' && !escapeNext) {
      inString = !inString;
    }

    // Track double escaped characters (\\)
    escapeNext = char === '\\' && !escapeNext;

    // Skip the rest if we're in a string
    if (inString) {
      continue;
    }

    // Count braces if we're not in a string
    if (char === '{') braceCount++;
    if (char === '}') {
      // Attempt to parse JSON once a fully matched object is detected
      if (--braceCount === 0 && currentJson.trim().length > 0) {
        try {
          parsed.push(JSON.parse(currentJson));
          currentJson = ''; // Reset for the next JSON object
        } catch {
          // If parsing fails, we continue accumulating characters
        }
      }
    }
  }

  // If there are remaining characters, it means the JSON object is incomplete
  return { parsed, remaining: currentJson };
}

export function toItalic(text: string): string {
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
  action: FunctionAction,
  success: boolean
): string {
  // @todo maybe reactivate after tests
  let actionMsg = `${message}\n${chalk.gray('│')}  `;
  const functionName = getFunctionName(action);
  const args = getFunctionArgs(action);

  Logger.debug('Args', args);

  switch (functionName) {
    case 'read_file':
      actionMsg += toItalic(
        `└ File ${success ? 'read' : 'read failed'}: ${args.path}`
      );
      break;
    case 'write_file':
      actionMsg += toItalic(
        `└ File ${success ? 'written' : 'write failed'}: ${args.path}`
      );
      break;
    case 'update_file':
      actionMsg += toItalic(
        `└ File ${success ? 'updated' : 'update failed'}: ${args.path}`
      );
      break;
    case 'run_shell':
      actionMsg += toItalic(
        `└ Command ${success ? 'executed' : 'execution failed'}: ${args.command}`
      );
      break;
    case 'browse_url':
      actionMsg += toItalic(
        `└ URL ${success ? 'browsed' : 'browsing failed'}: ${args.url}`
      );
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

/**
 * Parses stream content and handles potential chunked messages
 * @param content The content to parse
 * @param currentChunks Optional array of existing chunks
 * @returns Object containing parsed stream events and remaining chunks
 */
function parseStreamContent(
  content: string,
  currentChunks: string[] = []
): {
  streamEvents: StreamEvent[];
  chunks: string[];
} {
  try {
    // Try to parse content as complete JSON
    return {
      streamEvents: [JSON.parse(content)],
      chunks: [],
    };
  } catch {
    // Content might be chunked, use specialized parser
    const { parsed, remaining } = parseChunkedMessages<StreamEvent>(content);

    return {
      streamEvents: parsed,
      chunks: remaining ? [remaining, ...currentChunks] : currentChunks,
    };
  }
}

export async function parseStreamedResponse(
  agentResponse: AsyncIterable<Buffer>
) {
  const actions: FunctionAction[] = [];
  let message = '';

  let chunks: string[] = [];

  for await (const chunk of agentResponse) {
    let content = '';
    // Logger.debug('Chunk:', chunk.toString('utf-8'));

    //If there were previous chunks, we need to add them
    chunks.push(chunk.toString('utf-8'));
    content = chunks.join('');

    const { streamEvents, chunks: remainingChunks } = parseStreamContent(
      content,
      chunks
    );
    chunks = remainingChunks;

    streamEvents.forEach((streamEvent) => {
      if (streamEvent.status !== 'chunked_message') {
        Logger.debug('StreamEvent', streamEvent);
      }
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
