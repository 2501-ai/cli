import axios from 'axios';

import { API_HOST, API_VERSION } from '../constants';
import { readConfig } from '../utils/conf';
import { FormData } from 'formdata-node';
import { DEFAULT_ENGINE } from '../commands/init';
import {
  Configuration,
  EngineType,
  QueryResponseDTO,
  SystemInfo,
} from '../utils/types';

// const ONE_MINUTES_MILLIS = 60 * 1000;
const FIVE_MINUTES_MILLIS = 5 * 60 * 1000;
const TEN_MINUTES_MILLIS = 10 * 60 * 1000;

export const initAxios = async () => {
  const config = readConfig();
  if (!config?.api_key) {
    throw new Error('API key must be set.');
  }

  axios.defaults.headers.common['Authorization'] = `Bearer ${config?.api_key}`;
  axios.defaults.baseURL = `${API_HOST}${API_VERSION}`;
  axios.defaults.timeout = FIVE_MINUTES_MILLIS;
};

export const getPuppetMasterPlans = async (query: string) => {
  const { data: planResponse } = await axios.post('/puppetmaster/plan', {
    query,
  });
  return planResponse;
};

export const createAgent = async (
  workspace: string,
  selected_config: Configuration,
  sysinfo: SystemInfo,
  engine?: EngineType | undefined
) => {
  const { data: createResponse } = await axios.post('/agents', {
    workspace,
    configuration: selected_config.id,
    prompt: selected_config.prompt,
    engine: engine || DEFAULT_ENGINE,
    sysinfo,
    // files: workspaceResponse.vectorStoredFiles.map((file) => file.id),
  });
  return createResponse;
};

/**
 * Query the agent
 */
export const queryAgent = async (
  agentId: string,
  changed: boolean,
  query: string,
  workspaceTree: string,
  stream: boolean
) => {
  const { data } = await axios.post<QueryResponseDTO | AsyncIterable<Buffer>>(
    `/agents/${agentId}/query`,
    { query, changed, workspaceTree, stream },
    {
      responseType: stream ? 'stream' : 'json',
      timeout: stream ? TEN_MINUTES_MILLIS : FIVE_MINUTES_MILLIS,
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

/**
 * Index the workspace files for an agent
 * @param agentId
 * @param files
 */
export async function indexFiles(
  agentId: string,
  files: { path: string; data: Buffer }[]
  // filesIds: { id: string; name: string }[]
) {
  const data = new FormData();
  for (let i = 0; i < files.length; i++) {
    const name = files[i].path.split('/').pop();
    data.set('file' + i, new Blob([files[i].data]), name);
  }

  await axios.post(`/agents/${agentId}/files/index`, data);
}
