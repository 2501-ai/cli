// Handles the configuration of the application to ~/.2501/2501.conf
// Example configuration file (~/.2501/2501.conf):
// {
//   "workspace_disabled": false,
//   "agents": [
//     {
//       "id": "agent1",
//       "name": "Agent 1",
//       "workspace": "/path/to/workspace1",
//       "main_engine": "engine1",
//       "secondary_engine": "engine2",
//       "configuration": "config1"
//     },
//     {
//       "id": "agent2", 
//       "name": "Agent 2",
//       "workspace": "/path/to/workspace2",
//       "main_engine": "engine3",
//       "secondary_engine": "engine4",
//       "configuration": "config2"
//     }
//   ]
// }

import fs from 'fs';
import os from 'os';
import * as path from 'path';

interface AgentConfig {
  id: string;
  name: string;
  workspace: string;
  main_engine: string;
  secondary_engine: string;
  configuration: string;
}

type Config = {
  workspace_disabled: boolean;
  agents: AgentConfig[];
};

const CONFIG_DIR = path.join(os.homedir(), '.2501');
const CONFIG_FILE_PATH = path.join(CONFIG_DIR, '2501.conf');

/**
 * Reads the configuration from the specified file.
 * If the file doesn't exist, it creates a new configuration file with default values.
 * @returns The configuration object if successful, or null if an error occurred.
 */
export async function readConfig(): Promise<Config | null> {
  try {
    if (!fs.existsSync(CONFIG_FILE_PATH)) {
      await fs.mkdirSync(path.dirname(CONFIG_FILE_PATH), { recursive: true });
      await fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify({ workspace_disabled: false, agents: [] }, null, 2), 'utf8');
    }
    const data = await fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
    return JSON.parse(data) as Config;
  } catch (error) {
    console.error('Error reading configuration:', error);
    return null;
  }
}

/**
 * Writes the provided configuration object to the configuration file.
 * @param config - The configuration object to write.
 */
export async function writeConfig(config: Config): Promise<void> {
  try {
    const data = JSON.stringify(config, null, 2);
    await fs.writeFileSync(CONFIG_FILE_PATH, data, 'utf8');
  } catch (error) {
    console.error('Error writing configuration:', error);
  }
}

/**
 * Lists all agents from the configuration.
 * @returns An array of agent configurations.
 */
export async function listAgents(): Promise<AgentConfig[]> {
  const config = await readConfig();
  if (config) {
    return config.agents;
  } else {
    return [];
  }
}

/**
 * Lists all agents associated with a specific workspace URL.
 * @param workspaceUrl - The workspace URL to filter agents by.
 * @returns An array of agent configurations associated with the specified workspace URL.
 */
export async function listAgentsFromWorkspace(
  workspaceUrl: string  
): Promise<AgentConfig[]> {
  const config = await readConfig();
  if (config) {
    return config.agents.filter((agent) => agent.workspace === workspaceUrl);
  } else {
    return [];
  }
}

/**
 * Adds a new agent to the configuration if it doesn't already exist.
 * @param newAgent - The new agent configuration to add.
 */
export async function addAgent(newAgent: AgentConfig): Promise<void> {
  const config = await readConfig();
  if (config) {
    // Check if an agent with the same ID already exists
    const existingAgent = config.agents.find((agent) => agent.id === newAgent.id);
    if (existingAgent) {
      console.error('Agent with the same ID already exists:', newAgent.id);
      return;
    }

    config.agents.push(newAgent);
    await writeConfig(config);
  } else {
    console.error('Invalid configuration');
  }
}

/**
 * Clears all agents from the configuration.
 */
export async function flushAgents(): Promise<void> {
  try {
    await writeConfig({ workspace_disabled: false, agents: [] }); // Clear the entire configuration
  } catch (error) {
    console.error('Error flushing agents:', error);
  }
}