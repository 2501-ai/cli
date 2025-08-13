import axios from 'axios';

import { FormData } from 'formdata-node';
import { API_HOST, API_VERSION } from '../constants';
import { ConfigManager } from '../managers/configManager';
import { pluginService } from '../utils/plugins';
import {
  Configuration,
  CreateAgentResponse,
  EngineType,
  GetAgentResponse,
  HostInfo,
  QueryResponseDTO,
  SystemInfo,
} from '../utils/types';

// const ONE_MINUTES_MILLIS = 60 * 1000;
const FIVE_MINUTES_MILLIS = 5 * 60 * 1000;
const TEN_MINUTES_MILLIS = 10 * 60 * 1000;

export const initAxios = async () => {
  const apiKey = ConfigManager.instance.get('api_key');
  if (!apiKey) {
    throw new Error('API key must be set.');
  }

  // Set all axios defaults in one place
  axios.defaults.baseURL = `${API_HOST}${API_VERSION}`;
  axios.defaults.timeout = FIVE_MINUTES_MILLIS;
  axios.defaults.headers.common['Authorization'] = `Bearer ${apiKey}`;
};

export const createAgent = async (
  workspace: string,
  selected_config: Configuration,
  sysinfo: SystemInfo,
  engine: EngineType,
  hostInfo: HostInfo
): Promise<CreateAgentResponse> => {
  const { data: createResponse } = await axios.post('/agents', {
    workspace,
    configuration: selected_config.id,
    prompt: selected_config.prompt,
    engine,
    sysinfo,
    host: hostInfo,
  });

  // TODO: make engine return less data.
  return createResponse;
};

export const getAgent = async (agentId: string): Promise<GetAgentResponse> => {
  const { data } = await axios.get(`/agents/${agentId}`);
  return data;
};

export const updateAgent = async (
  agentId: string,
  data: {
    workspace?: string;
    cli_data?: Record<string, any>;
  }
): Promise<void> => {
  await axios.put(`/agents/${agentId}`, data);
};

/**
 * Query the agent
 */
export const queryAgent = async (
  agentId: string,
  changed: boolean,
  taskId: string,
  workspaceTree: string,
  stream: boolean
) => {
  const plugins = pluginService.getPlugins();

  const { data } = await axios.post<QueryResponseDTO | AsyncIterable<Buffer>>(
    `/agents/${agentId}/query`,
    {
      taskId,
      changed,
      workspaceTree,
      stream,
      plugins,
    },
    {
      responseType: stream ? 'stream' : 'json',
      timeout: stream ? TEN_MINUTES_MILLIS : FIVE_MINUTES_MILLIS,
    }
  );

  return data;
};

export const updateHostInfo = async (
  agentId: string,
  hostInfo: HostInfo
): Promise<void> => {
  await axios.put(`/agents/${agentId}/host`, hostInfo);
};

export const promptInput = async (
  agentId: string,
  taskId: string,
  command: string,
  output: string
) => {
  const { data } = await axios.post(`/agents/${agentId}/promptInput`, {
    taskId,
    command,
    output,
    stream: false,
  });
  return data;
};

/**
 * Submit tool outputs to the agent
 */
export const submitToolOutputs = async (
  agentId: string,
  taskId: string,
  toolOutputs: any[],
  stream: boolean
) => {
  const { data } = await axios.post<AsyncIterable<Buffer> | any>(
    `/agents/${agentId}/submitOutput`,
    {
      taskId,
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
) {
  const data = new FormData();
  for (let i = 0; i < files.length; i++) {
    const name = files[i].path.split('/').pop();
    data.set('file' + i, new Blob([files[i].data]), name);
  }

  await axios.post(`/agents/${agentId}/files/index`, data);
}

/**
 * Create a task for an agent
 * @param agentId - The ID of the agent
 * @param description - The task description (user query)
 * @returns - The task ID
 */
export const createTask = async (
  agentId: string,
  description: string
): Promise<{ id: string }> => {
  if (!agentId) throw new Error('Agent ID is required');
  const { data } = await axios.post(`/agents/${agentId}/tasks`, {
    description,
  });
  return data;
};

/**
 * Get all tasks for an agent
 * @param agentId - The ID of the agent
 * @returns - The tasks
 */
export const getTasks = async (
  agentId: string,
  status: string
): Promise<any[]> => {
  if (!agentId) throw new Error('Agent ID is required');
  const response = await axios.get(`/agents/${agentId}/tasks/${status}`);
  if (response.status !== 200) {
    throw new Error('Failed to get tasks');
  }
  return response.data.tasks;
};

export const updateTask = async (
  agentId: string,
  taskId: string,
  data: {
    status: string;
    host?: string;
    result?: any;
  }
) => {
  const response = await axios.put(`/agents/${agentId}/tasks/${taskId}`, data);
  return response.data;
};
