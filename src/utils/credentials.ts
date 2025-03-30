import fs from 'fs';
import path from 'path';
import Logger from './logger';
import { CredentialsConfig } from './types';

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

  public initialize(credentialsPath: string): void {
    if (!credentialsPath) {
      Logger.debug('No credentials path provided');
      return;
    }

    const resolvedPath = path.resolve(credentialsPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Credentials file not found at ${resolvedPath}`);
    }

    const credentialsContent = fs.readFileSync(resolvedPath, 'utf-8');
    this.credentials = JSON.parse(credentialsContent);
    Logger.debug('Credentials loaded successfully');
  }

  public getCredential(
    pluginName: string,
    credentialKey: string
  ): string | null {
    if (!this.credentials[pluginName]) {
      Logger.debug(`No credentials found for plugin: ${pluginName}`);
      return null;
    }

    const credential = this.credentials[pluginName][credentialKey];
    if (!credential) {
      Logger.debug(
        `Credential ${credentialKey} not found for plugin ${pluginName}`
      );
      return null;
    }

    return credential;
  }

  /**
   * Replaces credential placeholders in a command string.
   * Supports both {plugin.key} and {key} formats with a single pattern.
   */
  public replaceCredentialPlaceholders(command: string): string {
    // Quick validation
    if (!command?.trim() || !this.credentials) return command;

    // First pass: Handle {plugin.key} format
    const namespacedPattern = /{([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)}/g;
    return command.replace(namespacedPattern, (match, plugin, credKey) => {
      // Safe credential retrieval
      const value = this.credentials[plugin]?.[credKey];

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

export default CredentialsService.getInstance();
