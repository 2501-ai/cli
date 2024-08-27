import axios from 'axios';
import { API_HOST, API_VERSION } from '../constants';
import { readConfig } from '../utils/conf';

const config = readConfig();

export type QueryResponseDTO = {
  asynchronous: boolean;
  response?: string;
  actions?: {
    function: {
      arguments: any;
    };
    args: any;
  }[];
};

/**
 * Query the agent
 */
export const queryAgent: (
  agentId: string,
  changed: boolean,
  query: string
) => Promise<QueryResponseDTO> = async (
  agentId: string,
  changed: boolean,
  query: string
) => {
  const { data } = await axios.post<QueryResponseDTO>(
    `${API_HOST}${API_VERSION}/agents/${agentId}/query`,
    { query, changed },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config?.api_key}`,
      },
      timeout: 5 * 60 * 1000,
    }
  );

  return data;
};
