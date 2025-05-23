import dotenv from 'dotenv';
import Logger from './logger';
import { CredentialsConfig } from './types';
import { pluginService } from './plugins';
import { Command } from 'commander';

class CredentialsService {
  private credentials: CredentialsConfig = {};
  private static instance: CredentialsService;

  private constructor() {}

  public static getInstance(): CredentialsService {
    if (!CredentialsService.instance) {
      CredentialsService.instance = new CredentialsService();
    }
    return CredentialsService.instance;
  }

  public initialize(envPath?: string): void {
    if (envPath) {
      dotenv.config({ path: envPath });
    }

    const plugins = pluginService.getPlugins();

    // Process environment variables into credentials structure
    Object.entries(process.env).forEach(([key, value]) => {
      // Skip if no value
      if (!value) return;

      // Extract system and credential key from environment variable name
      const matches = key.match(/^([A-Z0-9]+)_([A-Z0-9_]+)$/);
      if (!matches) return;

      const [, system, credKey] = matches;
      const systemLower = system.toLowerCase();

      // Only store credentials for systems that exist in plugins
      if (plugins[systemLower]) {
        // Initialize system object if needed
        if (!this.credentials[systemLower]) {
          this.credentials[systemLower] = {};
        }

        // Store credential with lowercase key
        this.credentials[systemLower][credKey.toLowerCase()] = value;
        Logger.debug(`Loaded credential ${key} for plugin ${systemLower}`);
      }
    });

    Logger.debug('Credentials loaded successfully from environment variables');
  }

  /**
   * Replaces credential placeholders in a command string.
   * Supports both {plugin.key} and {key} formats with a single pattern.
   */
  public replaceCredentialPlaceholders(command: string): string {
    if (!command?.trim()) return command;

    // Pattern to match credential placeholders in format {PLUGIN_CREDKEY}
    const namespacedPattern = /{([a-zA-Z0-9_]+)_([a-zA-Z0-9_]+)}/g;
    return command.replace(namespacedPattern, (match, plugin, credKey) => {
      // Safe credential retrieval
      const value =
        this.credentials[plugin.toLowerCase()]?.[credKey.toLowerCase()];

      Logger.debug('credential_usage', {
        plugin,
        key: credKey,
        found: !!value,
        timestamp: Date.now(),
      });

      return value || match; // Keep placeholder if not found
    });
  }
}

export const credentialsService = CredentialsService.getInstance();

export const initPluginCredentials = (
  thisCommand: Command,
  actionCommand: Command
) => {
  const options = actionCommand.opts();
  credentialsService.initialize(options.env);
};
