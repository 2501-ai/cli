import { ACTION_FNS } from '../managers/agentManager';
import { jsonrepair } from 'jsonrepair';
import { cleanupBackticks } from './json';
import Logger from './logger';
import { FunctionAction } from './types';

/**
 * TODO: This function should be removed in the future, and we should have a standardised way to get the function name
 */
export const getFunctionName = (
  action: FunctionAction
): keyof typeof ACTION_FNS =>
  typeof action.function === 'object'
    ? (action.function as any).name
    : (action.function as any);

/**
 * Get the arguments of a function action
 * TODO: This function should be removed in the future, and we should have a standardised way to get the function arguments
 */
export const getFunctionArgs = (action: FunctionAction) => {
  let args: any;
  // TODO: The action arguments needs a cleaner way to be parsed.
  if (typeof action.function !== 'string') {
    args = action.function.arguments;

    // Logger.debug('Previous args: %s', args);
    if (typeof args === 'string') {
      // console.log('Args:', JSON.stringify(args));
      try {
        args = JSON.parse(args);
      } catch (e) {
        // console.log('Error parsing JSON: %s', JSON.stringify(args));
        if (args.indexOf('`') !== -1) {
          Logger.debug('Cleaning up backticks for args:', args);
          args = JSON.parse(cleanupBackticks(args));
        } else {
          const fixed_args = jsonrepair(args);
          args = JSON.parse(fixed_args);
        }
      }
      // Logger.debug('New args: %s', args);
    }
  } else {
    // This is usually for the run_shell command.
    args = action.args;
  }

  return args;
};
