import { ACTION_FNS } from '../managers/agentManager';
import { FunctionAction } from '../helpers/api';
import { jsonrepair } from 'jsonrepair';
import { convertFormToJSON } from './json';

/**
 * TODO: This function should be removed in the future, and we should have a standardised way to get the function name
 */
export const getFunctionName = (
  action: FunctionAction
): keyof typeof ACTION_FNS =>
  typeof action.function === 'object'
    ? action.function.name
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
      const standardArgs = args.replace(/`([\s\S]*?)`/g, (_, content) => {
        const processedContent: string = content.replace(/\n/g, '\\n');
        return `"${processedContent.replace(/"/g, '\\"')}"`;
      });
      // Logger.debug('Standard args:', standardArgs);
      try {
        args = JSON.parse(standardArgs);
      } catch (e) {
        const fixed_args = jsonrepair(standardArgs);
        args = JSON.parse(convertFormToJSON(fixed_args));
      }
      // Logger.debug('New args: %s', args);
    }
  } else {
    // This is usually for the run_shell command.
    args = action.args;
  }

  return args;
};
