import fs from 'fs';
import * as path from 'path';

import Logger from '../utils/logger';
import { AgentConfig, LocalConfig } from './types';
import { clearWorkspaceState } from '../helpers/workspace';
import { CONFIG_DIR } from '../constants';
const CONFIG_FILE_PATH = path.join(CONFIG_DIR, '2501.conf');

/**
 * Reads the configuration from the specified file.
 * If the file doesn't exist, it creates a new configuration file with default values.
 * @returns The configuration object if successful, or null if an error occurred.
 */
export function readConfig(): LocalConfig | null {
  try {
    if (!fs.existsSync(CONFIG_FILE_PATH)) {
      fs.mkdirSync(path.dirname(CONFIG_FILE_PATH), { recursive: true });
      fs.writeFileSync(
        CONFIG_FILE_PATH,
        JSON.stringify(
          { workspace_disabled: false, agents: [], stream: true },
          null,
          2
        ),
        'utf8'
      );
    }
    const data = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    Logger.error('Error reading configuration:', error);
    return null;
  }
}

/**
 * Writes the specified key-value pair to the configuration file.
 * @param key - The key to set.
 * @param value - The value to set.
 */
export function setValue<K extends keyof LocalConfig>(
  key: K,
  value: LocalConfig[K]
): void {
  try {
    const config = readConfig();
    if (config) {
      config[key] = value;
      writeConfig(config);
    }
  } catch (error) {
    Logger.error('Error setting value:', error);
  }
}

/**
 * Writes the provided configuration object to the configuration file.
 * @param config - The configuration object to write.
 */
export function writeConfig(config: LocalConfig): void {
  try {
    const data = JSON.stringify(config, null, 2);
    fs.writeFileSync(CONFIG_FILE_PATH, data, 'utf8');
  } catch (error) {
    Logger.error('Error writing configuration:', error);
  }
}

/**
 * Lists all agents from the configuration.
 * @returns An array of agent configurations.
 */
export function listAgents(): AgentConfig[] {
  const config = readConfig();
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
export function listAgentsFromWorkspace(workspaceUrl: string): AgentConfig[] {
  const config = readConfig();
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
export function addAgent(newAgent: AgentConfig): void {
  const config = readConfig();
  if (config) {
    // Check if an agent with the same ID already exists
    const existingAgent = config.agents.find(
      (agent) => agent.id === newAgent.id
    );
    if (existingAgent) {
      Logger.error('Agent with the same ID already exists:', newAgent.id);
      return;
    }

    config.agents.push(newAgent);
    writeConfig(config);
  } else {
    Logger.error('Invalid configuration');
  }
}

/**
 * Clears current agent or all agents from the configuration.
 * @param workspacePath - The workspace to be flushed
 * @param [all] - If true, clears all agents on the machine.
 */
export async function flushAgents(
  workspacePath: string,
  all?: boolean
): Promise<void> {
  try {
    const config = readConfig();
    if (!config) {
      return;
    }

    if (!all) {
      // Flush agents associated with the specified workspace
      config.agents = config.agents.filter((agent) => {
        const isInWorkspace = agent.workspace === workspacePath;
        if (isInWorkspace) {
          Logger.debug('Flushing agent:', agent.id);
          clearWorkspaceState(agent.id);
        }
        return !isInWorkspace;
      });
      writeConfig(config);
      return;
    }

    // Flush all agents and workspace states.
    config.agents.forEach((agent) => clearWorkspaceState(agent.id));
    config.agents = []; // Empty the agents array
    writeConfig(config);
  } catch (error) {
    Logger.error('Error flushing agents:', error);
  }
}

export function getEligibleAgent(workspace?: string): AgentConfig | null {
  const agents = workspace ? listAgentsFromWorkspace(workspace) : listAgents();
  return agents[agents.length - 1];
}
