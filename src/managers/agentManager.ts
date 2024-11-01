import axios from 'axios';
import fs from 'fs';
import { ASYNC_TERMINAL_STATUSES, QueryStatus } from '../constants';

import {
  browse_url,
  read_file,
  run_shell,
  update_file,
  write_file,
} from '../helpers/actions';

import Logger from '../utils/logger';
import { readConfig } from '../utils/conf';

import { getAgentStatus } from '../helpers/api';
import {
  AgentCallbackType,
  EngineCapability,
  EngineType,
  FunctionAction,
  FunctionExecutionResult,
} from '../utils/types';
import { getFunctionName } from '../utils/actions';

const MAX_RETRY = 3;

export const ACTION_FNS = {
  browse_url,
  read_file,
  run_shell,
  write_file,
  update_file,
};

export class AgentManager {
  id: string;
  name: string;
  engine: EngineType;
  workspace: string;
  errorRetries = 0;
  capabilities: EngineCapability[];

  constructor(options: {
    id: string;
    name: string;
    engine: EngineType;
    workspace: string;
    callback?: AgentCallbackType;
    capabilities: EngineCapability[];
  }) {
    this.id = options.id;
    this.name = options.name;
    this.engine = options.engine;
    this.workspace = options.workspace;
    this.capabilities = options.capabilities;
  }

  async checkStatus(): Promise<void | {
    actions: FunctionAction[];
    answer?: string;
  }> {
    try {
      const data = await getAgentStatus(this.id);
      if (!data) {
        return;
      }

      if (data.status === QueryStatus.Completed) {
        return {
          answer: data.answer,
          actions: data.actions ?? [],
        };
      }

      if (data.status === QueryStatus.Failed) {
        Logger.error('Query failed:', data.error);
      }

      if (ASYNC_TERMINAL_STATUSES.includes(data.status)) {
        Logger.debug('Unhandled status', data.status);
        Logger.debug('Data', data);
        Logger.log('TODO: Implement action required');
        return process.exit(1);
      }

      if (data.actions) {
        return { actions: data.actions };
      }
    } catch (error: any) {
      Logger.error(
        'Error checking query status:',
        error.message,
        '\n Retrying...'
      );
      this.errorRetries++;

      // Prevent infinite loop
      if (this.errorRetries > MAX_RETRY) {
        Logger.error('Max retries reached, exiting...');
        process.exit(1);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
    return this.checkStatus();
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
    Logger.debug('    Action args:', args);
    let corrected = false;
    // Specific to write_file action
    if (args.path && args.content) {
      const previous =
        ACTION_FNS.read_file({ path: args.path }) || 'NO PREVIOUS VERSION';
      try {
        const config = readConfig();
        const { data: correctionData } = await axios.post(
          `/agents/${this.id}/verifyOutput`,
          {
            task: taskTitle,
            previous,
            proposal: typeof args === 'string' ? args : JSON.stringify(args),
          },
          {
            timeout: 60000,
            headers: {
              Authorization: `Bearer ${config?.api_key}`,
            },
          }
        );

        Logger.debug('Correction data:', correctionData);

        if (
          correctionData.corrected_output &&
          correctionData.corrected_output !== args.content
        ) {
          corrected = true;
          args.content = correctionData.corrected_output;

          // prevent calling update function
          // if (args.updates) {
          //   delete args.updates;
          //   function_name = ACTION_FNS.write_file.name as typeof function_name;
          // }
        }
      } catch (e) {
        Logger.error('verifyOutput error or timeout', e);
        throw e;
      }
    }
    Logger.debug(
      `   Processing action: ${taskTitle} | On function ${functionName}`
    );

    try {
      let output = (await ACTION_FNS[functionName](args)) as string;

      if (corrected) {
        output += `\n\n NOTE: your original content for ${args.path} was corrected with the new version below before running the function: \n\n${args.content}`;
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
