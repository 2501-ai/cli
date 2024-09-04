import axios from 'axios';

import { API_HOST, API_VERSION, QueryStatus } from '../constants';
import { readConfig } from '../utils/conf';

const config = readConfig();

axios.defaults.headers.common['Authorization'] = `Bearer ${config?.api_key}`;
axios.defaults.baseURL = `${API_HOST}${API_VERSION}`;

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
  prompt?: string;
};

const FIVE_MINUTES_MILLIS = 5 * 60 * 1000;
const TEN_MINUTES_MILLIS = 10 * 60 * 1000;

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
    `/agents/${agentId}/query`,
    { query, changed, stream },
    {
      responseType: stream ? 'stream' : 'json',
      timeout: stream ? TEN_MINUTES_MILLIS : FIVE_MINUTES_MILLIS,
    }
  );

  return data;
};

export const getAgentStatus = async (
  agentId: string,
  engine: string
): Promise<{
  status: QueryStatus;
  answer?: string;
  error?: string;
  actions?: FunctionAction[];
} | null> => {
  if (!engine.includes('openai')) {
    return null;
  }
  const { data } = await axios.get(
    `${API_HOST}${API_VERSION}/agents/${agentId}/status`
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
    `/agents/${agentId}/submitOutput`,
    {
      tool_outputs: toolOutputs,
      stream,
    },
    {
      timeout: stream ? TEN_MINUTES_MILLIS : FIVE_MINUTES_MILLIS,
      responseType: stream ? 'stream' : 'json',
    }
  );
  return data;
};

export const cancelQuery = async (agentId: string) => {
  const { data } = await axios.post(`/agents/${agentId}/cancel`);
  return data;
};
