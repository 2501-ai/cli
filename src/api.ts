import { readConfig } from './utils/conf';
import axios from 'axios';
import { API_HOST, API_VERSION } from './constants';

const config = readConfig();

axios.defaults.baseURL = `${API_HOST}${API_VERSION}`;
axios.defaults.timeout = 8000;
axios.defaults.headers.common['Authorization'] = `Bearer ${config?.api_key}`;

export interface UserConfiguration {
  key: string;
  prompt: string;
  id: string;
}

export interface UserAgent {
  id: string;
  name: string;
}

export const getConfigurations = async (): Promise<UserConfiguration[]> => {
  const { data: configurations } = await axios.get(`/configurations`);
  return configurations;
};

export const createAgent = async (
  workspace: string,
  configurationId: string,
  prompt: string,
  engine: string,
  files: string[]
): Promise<UserAgent> => {
  const { data: agent } = await axios.post('/agents', {
    workspace,
    configuration: configurationId,
    prompt,
    engine,
    files,
  });
  return agent;
};
