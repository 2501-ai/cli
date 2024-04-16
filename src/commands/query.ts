import axios from 'axios';
import { terminal } from 'terminal-kit';
import { jsonrepair } from 'jsonrepair';

import { listAgentsFromWorkspace } from '../utils/conf';
import { convertFormToJSON } from '../utils/json';
import { API_HOST, API_VERSION } from '../constants';

import * as actionsFns from '../utils/actions';

async function checkStatus(agentId: string) {
  try {
    const { data } = await axios.get(
      `${API_HOST}${API_VERSION}/agents/${agentId}/status`
    );

    if (data.status === 'completed') {
      return console.log('Query completed:', data.result);
    }

    if (data.status === 'failed') {
      return console.error('Query failed:', data.error);
    }

    if (data.actions) {
      await processActions(data.actions);
      return;
    }

    setTimeout(() => checkStatus(agentId), 1000);
  } catch (error: any) {
    console.error('Error checking query status:', error.message);
  }
}

async function processActions(actions: any[]) {
  let tool_outputs: any[] = [];
  for (const call of actions) {
    let args: any;

    if (call.function.arguments) {
      args = call.function.arguments;
      if (typeof args === 'string') {
        const fixed_args = jsonrepair(args);
        args = JSON.parse(convertFormToJSON(fixed_args));
      }
    } else {
      args = call.args;
    }

    console.log('args', args);
    if (args.answer) {
      console.log('Agent:', args.answer);
    }

    if (args.command) {
      console.log('Running: ', args.command);
    }

    if (args.url) {
      console.log('Browsing: ', args.url);
    }

    // if (args.path && args.content && verification_active.value) {
    //   const previous = await window.electronAPI.getFileFromWorkspace(args.path);
    //   try {
    //     const { data: correctionData } = await axios.post(
    //       `/agents/${agent.value.db_id}/verifyOutput`,
    //       {
    //         task: args.answer || currentInput.value,
    //         previous,
    //         proposal: args.content,
    //       },
    //       { timeout: 60000 }
    //     );

    //     if (
    //       correctionData.corrected_output &&
    //       correctionData.corrected_output !== args.content
    //     ) {
    //       args.content = correctionData.corrected_output;
    //     }
    //   } catch (e) {
    //     console.error('verifyOutput error or timeout', e);
    //   }
    // }

    const functions = actionsFns as any;
    const output = await functions[call.function.name](args);
    console.log('output', output);

    // for (const o of output) {
    //   if (o.output && !!o.output.length) {
    //     appendMessage(
    //       'verbose',
    //       args.url ? `Analysing ${args.url}` : o.output
    //     );
    //   }
    // }
    tool_outputs = tool_outputs.concat(output);
  }

  // if (agent.value.main_engine.includes('openai/gpt4')) {
  //   try {
  //     await axios.post(`/agents/${agent.value.db_id}/submitOutput`, {
  //       tool_outputs,
  //     });
  //     setTimeout(checkAgentStatus, 2000);
  //   } catch (e) {
  //     checkAgentStatus();
  //   }
  // } else {
  //   console.log('tool_outputs', tool_outputs);
  //   queryAgent(
  //     `here is the output of the actions: ${tool_outputs
  //       .map((o) => o.output)
  //       .join('\n')}`
  //   );
  // }
  return;
}

// Function to execute the query command
export async function queryCommand(
  query: string,
  options: {
    workspace?: string;
    agentId?: string;
  }
) {
  const workspace = options.workspace || process.cwd();
  console.log(`Current workspace: ${workspace}`);

  const agents = await listAgentsFromWorkspace(workspace);
  const agentId = options.agentId || (agents.length > 0 ? agents[0].id : null);

  if (!agentId) {
    console.error('No agent found in the specified workspace.');
    return;
  }

  try {
    terminal.spinner();
    terminal('thinking...\n');
    const { data } = await axios.post(
      `${API_HOST}${API_VERSION}/agents/${agentId}/query`,
      { query }
    );

    console.log('Query result:', data);

    if (data.asynchronous) {
      return checkStatus(agentId);
    }

    process.exit(0);
  } catch (error: any) {
    console.error('Error querying agent:', error.message);
    process.exit(0);
  }
}
