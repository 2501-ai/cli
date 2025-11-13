import axios, { AxiosError } from 'axios';

import { FormData } from 'formdata-node';
import { API_HOST, API_VERSION } from '../constants';
import { ConfigManager } from '../managers/configManager';
import { TelemetryPayload } from '../telemetry';
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
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;

let isInitialized = false;

export const initAxios = () => {
  const apiKey = ConfigManager.instance.get('api_key');
  if (!apiKey) {
    throw new Error('API key must be set.');
  }

  // Set all axios defaults in one place
  axios.defaults.baseURL = `${API_HOST}${API_VERSION}`;
  axios.defaults.timeout = TEN_MINUTES_MS;
  axios.defaults.headers.common['Authorization'] = `Bearer ${apiKey}`;
  isInitialized = true;
};

/**
 * Send telemetry to API
 */
export const sendTelemetry = async (
  payload: TelemetryPayload
): Promise<void> => {
  try {
    if (!isInitialized) {
      if (process.env.TFZO_DEBUG === 'true') {
        console.debug('[Telemetry] Not initialized, skipping send');
      }
      return;
    }
    await axios.post('/telemetry', payload, { timeout: 3_000 });
  } catch (error) {
    // Silent fail
    if (process.env.TFZO_DEBUG === 'true') {
      const axiosError = error as AxiosError;
      console.error('[Telemetry] Failed to send:', {
        payload: JSON.stringify(payload),
        request: {
          url: axiosError.config?.url,
          method: axiosError.config?.method,
          data: axiosError.config?.data,
        },
        response: {
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
          data: JSON.stringify(axiosError.response?.data || 'no data'),
        },
        message: (error as Error).message,
      });
    }
  }
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
      timeout: TEN_MINUTES_MS,
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
      timeout: stream ? TEN_MINUTES_MS : FIVE_MINUTES_MS,
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
    data.set('file' + i, new Blob([new Uint8Array(files[i].data)]), name);
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
