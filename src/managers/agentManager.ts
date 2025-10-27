import fs from 'fs';

import {
  browse_url,
  read_file,
  run_shell,
  task_completed,
  update_file,
  write_file,
} from '../helpers/actions';

import Logger from '../utils/logger';

import { getFunctionName } from '../utils/actions';
import {
  AgentConfig,
  FunctionAction,
  FunctionExecutionResult,
} from '../utils/types';

export const ACTION_FNS = {
  browse_url,
  read_file,
  run_shell,
  write_file,
  update_file,
  task_completed,
} as const;

export class AgentManager {
  workspace: string;
  agentConfig: AgentConfig;

  constructor(options: { workspace: string; agentConfig: AgentConfig }) {
    this.workspace = options.workspace;
    this.agentConfig = options.agentConfig;
  }

  async executeAction(
    action: FunctionAction,
    args: any
  ): Promise<FunctionExecutionResult> {
    const functionName = getFunctionName(action);

    if (!ACTION_FNS[functionName]) {
      return {
        tool_call_id: action.id,
        output: `Function '${functionName}' not found. Please verify the function name and try again.`,
        success: false,
      };
    }

    let taskTitle: string = args.answer || args.command || '';
    if (args.url) {
      taskTitle = 'Browsing: ' + args.url;
    }
    Logger.debug(
      `   Processing action: ${taskTitle} | On function ${functionName}`
    );

    try {
      let output = (await ACTION_FNS[functionName](args)) as string;

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
}
