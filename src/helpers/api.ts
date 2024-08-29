import axios from 'axios';
import { API_HOST, API_VERSION } from '../constants';
import { readConfig } from '../utils/conf';

const config = readConfig();

export type FunctionAction = {
  id: string; // ex: "call_fPPBsOHeRJGmpcZQeT3wRVTK",
  type: string; // ex: 'function'
  function: {
    name: string; // ex: 'update_file_content';
    arguments: any;
  };
  args: any;
};

export type QueryResponseDTO = {
  asynchronous: boolean;
  response?: string;
  actions?: FunctionAction[];
};

/**
 * Query the agent
 */
export const queryAgent = async (
  agentId: string,
  changed: boolean,
  query: string,
  stream: boolean
) => {
  const { data } = await axios.post<QueryResponseDTO | AsyncIterable<Buffer>>(
    `${API_HOST}${API_VERSION}/agents/${agentId}/query`,
    { query, changed, stream },
    {
      responseType: stream ? 'stream' : 'json',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config?.api_key}`,
      },
      timeout: 5 * 60 * 1000,
    }
  );

  return data;
};

/**
 * Submit tool outputs to the agent
 */
export const submitToolOutputs = async (
  agentId: string,
  toolOutputs: any[],
  stream: boolean
) => {
  const { data } = await axios.post<AsyncIterable<Buffer> | any>(
    `${API_HOST}${API_VERSION}/agents/${agentId}/submitOutput`,
    {
      tool_outputs: toolOutputs,
      stream,
    },
    {
      responseType: stream ? 'stream' : 'json',
      headers: {
        Authorization: `Bearer ${config?.api_key}`,
      },
    }
  );
  return data;
};
