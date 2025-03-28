import Logger from './logger';
import { CredentialsConfig } from './types';
import dotenv from 'dotenv';
import pluginService from './plugins';

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

    // Replace {PLUGINNAME_CREDENTIALKEY} format
    return command.replace(
      /\{([A-Z0-9]+)_([A-Z0-9_]+)\}/g,
      (match, system, key) => {
        const systemLower = system.toLowerCase();
        const keyLower = key.toLowerCase();
        const value = this.credentials[systemLower]?.[keyLower];

        if (!value) {
          Logger.debug(`No credential found for ${systemLower}.${keyLower}`);
          return match;
        }
        return value;
      }
    );
  }
}

export default CredentialsService.getInstance();
