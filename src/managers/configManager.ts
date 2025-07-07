import { readConfig, writeConfig } from '../utils/conf';
import Logger from '../utils/logger';
import { LocalConfig, LocalConfigKey, REMOTE_EXEC_TYPES } from '../utils/types';

export const DEFAULT_CONFIG: LocalConfig = {
  workspace_disabled: false,
  agents: [],
  stream: true,
  join_discord_shown: false,
  disable_spinner: true,
  api_key: '',
  engine: 'rhino',
  telemetry_enabled: true,
  auto_update: true,
  remote_exec: false,
  remote_exec_target: '',
  remote_exec_port: 22,
  remote_exec_type: 'unix',
  remote_exec_private_key: '',
  remote_exec_user: 'root',
  remote_exec_password: '',
};

// Configuration validation rules
const CONFIG_VALIDATORS: Record<LocalConfigKey, (value: any) => boolean> = {
  workspace_disabled: (value) => typeof value === 'boolean',
  agents: () => true, // Bypass validation for now
  stream: (value) => typeof value === 'boolean',
  join_discord_shown: (value) => typeof value === 'boolean',
  disable_spinner: (value) => typeof value === 'boolean',
  api_key: (value) => typeof value === 'string',
  engine: (value) => typeof value === 'string',
  telemetry_enabled: (value) => typeof value === 'boolean',
  auto_update: (value) => typeof value === 'boolean',
  remote_exec: (value) => typeof value === 'boolean',
  remote_exec_target: (value) => typeof value === 'string',
  remote_exec_private_key: (value) => typeof value === 'string',
  remote_exec_port: (value) => typeof value === 'number',
  remote_exec_user: (value) => typeof value === 'string',
  remote_exec_type: (value) => REMOTE_EXEC_TYPES.includes(value),
  remote_exec_password: (value) => typeof value === 'string',
};

export class ConfigManager {
  private _config: LocalConfig;
  private static _instance: ConfigManager;

  static get instance() {
    if (!ConfigManager._instance) {
      ConfigManager._instance = new ConfigManager();
    }
    return ConfigManager._instance;
  }

  constructor() {
    let config = readConfig();

    // Set default config if no config file exists
    if (!config) {
      writeConfig(DEFAULT_CONFIG);
      config = DEFAULT_CONFIG;
    }

    // Make sure the config is up to date with the default config.
    this._config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set a specific configuration key
   * @param key - Configuration key to set
   * @param value - Value to set
   * @throws {Error} If key is invalid, value is invalid, or write fails
   */
  set<K extends LocalConfigKey>(key: K, value: LocalConfig[K]): void {
    // Validate the key exists in the type system (this is compile-time safe)
    if (!(key in CONFIG_VALIDATORS)) {
      throw new Error(`Invalid configuration key: ${key}`);
    }

    // Validate the value
    if (!CONFIG_VALIDATORS[key](value)) {
      throw new Error(
        `Invalid value for ${key}: ${value}. Expected ${typeof DEFAULT_CONFIG[key]}`
      );
    }

    // Create new config with the updated value
    const newConfig = { ...this._config, [key]: value };

    try {
      writeConfig(newConfig);
      this._config = newConfig;
    } catch (error) {
      Logger.error(`Failed to set ${key}:`, error);
      throw new Error(
        `Failed to save configuration: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get a specific configuration value
   * @param key - Configuration key to get
   * @returns The configuration value
   */
  get<K extends LocalConfigKey>(key: K): LocalConfig[K] {
    return this._config[key];
  }
}
