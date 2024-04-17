// Handles the configuration of the application to ~/.2501/2501.conf
// Example configuration file (~/.2501/2501.conf):
// [
//   {
//     "id": "agent1",
//     "workspace": "/path/to/workspace1"
//   },
//   {
//     "id": "agent2",
//     "workspace": "/path/to/workspace2"
//   }
// ]

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

type Config = AgentConfig[];

const CONFIG_DIR = path.join(os.homedir(), '.2501');
const CONFIG_FILE_PATH = path.join(CONFIG_DIR, '2501.conf');

// Read configuration from file
export async function readConfig(): Promise<Config | null> {
  try {
    if (!fs.existsSync(CONFIG_FILE_PATH)) {
      await fs.mkdirSync(path.dirname(CONFIG_FILE_PATH), { recursive: true });
      await fs.writeFileSync(CONFIG_FILE_PATH, '[]', 'utf8');
    }
    const data = await fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
    return JSON.parse(data) as Config;
  } catch (error) {
    console.error('Error reading configuration:', error);
    return null;
  }
}

// Write configuration to file
export async function writeConfig(config: Config): Promise<void> {
  try {
    const data = JSON.stringify(config, null, 2);
    await fs.writeFileSync(CONFIG_FILE_PATH, data, 'utf8');
  } catch (error) {
    console.error('Error writing configuration:', error);
  }
}

// Get agent workspace from configuration
export async function getAgentWorkspace(
  agentId: string
): Promise<string | null> {
  const config = await readConfig();
  if (config) {
    const agent = config.find((agent) => agent.id === agentId);
    if (agent) {
      return agent.workspace;
    } else {
      console.error('Agent workspace not found for agent ID:', agentId);
      return null;
    }
  } else {
    console.error('Invalid configuration');
    return null;
  }
}

// Delete agent workspace from configuration
export async function deleteAgentWorkspace(agentId: string): Promise<void> {
  const config = await readConfig();
  if (config) {
    const index = config.findIndex((agent) => agent.id === agentId);
    if (index !== -1) {
      config.splice(index, 1);
      await writeConfig(config);
    } else {
      console.error(
        'Agent workspace not found for deletion, agent ID:',
        agentId
      );
    }
  } else {
    console.error('Invalid configuration');
  }
}

// List all agents
export async function listAgents(): Promise<AgentConfig[]> {
  const config = await readConfig();
  if (config) {
    return config;
  } else {
    return [];
  }
}

// List agents from a specific workspace
export async function listAgentsFromWorkspace(
  workspaceUrl: string
): Promise<AgentConfig[]> {
  const config = await readConfig();
  if (config) {
    return config.filter((agent) => agent.workspace === workspaceUrl);
  } else {
    return [];
  }
}

// Add a new agent to the configuration
export async function addAgent(newAgent: AgentConfig): Promise<void> {
  const config = await readConfig();
  if (config) {
    // Check if an agent with the same ID already exists
    const existingAgent = config.find((agent) => agent.id === newAgent.id);
    if (existingAgent) {
      console.error('Agent with the same ID already exists:', newAgent.id);
      return;
    }

    config.push(newAgent);
    await writeConfig(config);
  } else {
    console.error('Invalid configuration');
  }
}
