import axios from 'axios';
import fs from 'fs';

import {
  Actions,
  browse_url,
  read_file,
  run_shell,
  task_completed,
  update_file,
  write_file,
} from '../helpers/actions';

import Logger from '../utils/logger';

import chalk from 'chalk';
import { BLACKLISTED_COMMANDS } from '../constants';
import { promptInput } from '../helpers/api';
import { getFunctionName } from '../utils/actions';
import {
  AgentConfig,
  FunctionAction,
  FunctionExecutionResult,
} from '../utils/types';

export const ACTION_FNS: Actions = {
  browse_url,
  read_file,
  run_shell,
  write_file,
  update_file,
  task_completed,
};

const BLACKLISTED_ERROR_MESSAGE = [
  `EXECUTION BLOCKED: Content contains blocked command`,
  'SECURITY VIOLATION:',
  `Interactive terminal editors (${BLACKLISTED_COMMANDS.join(', ')}) are strictly prohibited in this environment.`,
  'These commands require direct user interaction and violate the automated execution policy.',
  'NOTE: All content containing editor commands will be systematically blocked.',
].join('\n');

function isBlacklistedCommand(command: string): boolean {
  return BLACKLISTED_COMMANDS.some((blocked) => {
    // Create a regex pattern that matches the blocked word as a standalone command
    // This checks for word boundaries or command separators around the blocked term
    const pattern = new RegExp(
      `(^|\\s|;|\\||&|>|<)${blocked}($|\\s|;|\\||&|>|<)`,
      'i'
    );
    return pattern.test(command);
  });
}

export class AgentManager {
  workspace: string;
  agentConfig: AgentConfig;
  taskId: string;

  constructor(options: {
    workspace: string;
    agentConfig: AgentConfig;
    taskId: string;
  }) {
    this.workspace = options.workspace;
    this.agentConfig = options.agentConfig;
    this.taskId = options.taskId;
  }

  /**
   * Handle cases where the agent needs to provide input to the commands.
   */
  async onPrompt(command: string, stdout: string): Promise<string> {
    const agentInput = await promptInput(
      this.agentConfig.id,
      this.taskId,
      command,
      stdout
    );
    Logger.log(
      `${chalk.gray('│')}  REPL mode - Sending input to stream: ${agentInput}`
    );
    return agentInput.response;
  }

  async executeAction<FA extends FunctionAction>(
    action: FA,
    args: any //TODO: type this
  ): Promise<FunctionExecutionResult> {
    const functionName = getFunctionName(action);

    if (!ACTION_FNS[functionName]) {
      return {
        tool_call_id: action.id,
        output: `Function '${functionName}' not found. Please verify the function name and try again.`,
        success: false,
      };
    }

    if (args.command) {
      if (isBlacklistedCommand(args.command)) {
        return {
          tool_call_id: action.id,
          output: BLACKLISTED_ERROR_MESSAGE,
          success: false,
        };
      }
    }

    let taskTitle: string = args.answer || '';
    if (args.url) {
      taskTitle = 'Browsing: ' + args.url;
    }

    // Logger.debug('Action args:', args);
    let corrected = false;

    // Specific to write_file action
    const isWritefile =
      args.path && args.content && functionName === 'write_file';
    if (isWritefile) {
      corrected = await this.verifyOutputContent(args, taskTitle);
    }
    Logger.debug(
      `   Processing action: ${taskTitle} | On function ${functionName}`
    );

    if (action.function === 'run_shell') {
      args.onPrompt = this.onPrompt.bind(this);
    }

    try {
      let output = (await ACTION_FNS[functionName](args)) as string;

      if (corrected) {
        output += `\n\n NOTE: your original content for ${args.path} was corrected with the new version below before running the function: \n\n${args.content}`;
      }

      if (output.length > 50000) {
        output = `
        ERROR: The output is too large to display to prevent performance issues.
        Use an alternative method to retrieve the relevant information for the user (for example grep, an another command or sample the content first).
        `;

        return {
          tool_call_id: action.id,
          output,
          success: false,
        };
      }

      return {
        tool_call_id: action.id,
        output,
        success: true,
      };
    } catch (e: any) {
      Logger.debug('Error processing action:', e);
      // TODO: give the file content concerned ?
      let content = '';
      if (args.path) {
        try {
          content = `
          File concerned: \`${args.path}\`
          File content:
          \`\`\`
          ${fs.readFileSync(args.path, 'utf8')}
          \`\`\``;
        } catch (e) {}
      }
      return {
        tool_call_id: action.id,
        output: `I failed to run ${functionName}, please fix the situation or files. Feel free to explore the files again (excluding ignored files) if necessary.
        Error message :
        \`\`\`
        ${e.message}
        \`\`\`${content}`,
        success: false,
      };
    }
  }

  /**
   * Verify the output content for the write_file action.
   */
  private async verifyOutputContent(
    args: any,
    taskTitle: string
  ): Promise<boolean> {
    let corrected = false;
    const previous =
      ACTION_FNS.read_file({ path: args.path }) || 'NO PREVIOUS VERSION';
    try {
      const { data: correctionData } = await axios.post(
        `/agents/${this.agentConfig.id}/verifyOutput`,
        {
          task: taskTitle,
          previous,
          proposal: args.content,
        },
        {
          timeout: 150000,
        }
      );

      Logger.debug('Correction data:', correctionData);

      if (
        correctionData.corrected_output &&
        correctionData.corrected_output !== args.content
      ) {
        corrected = true;
        args.content = correctionData.corrected_output;
      }
    } catch (e) {
      Logger.error('verifyOutput error or timeout', e);
      throw e;
    }
    return corrected;
  }
}
