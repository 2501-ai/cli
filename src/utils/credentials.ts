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

    try {
      const resolvedPath = path.resolve(credentialsPath);
      if (!fs.existsSync(resolvedPath)) {
        Logger.debug(`Credentials file not found at ${resolvedPath}`);
        return;
      }

      const credentialsContent = fs.readFileSync(resolvedPath, 'utf-8');
      this.credentials = JSON.parse(credentialsContent);
      Logger.debug('Credentials loaded successfully');
    } catch (error) {
      Logger.debug(`Error loading credentials: ${error}`);
    }
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

  public replaceCredentialPlaceholders(command: string): string {
    if (!this.credentials || Object.keys(this.credentials).length === 0) {
      return command;
    }

    let result = command;

    Object.keys(this.credentials).forEach((pluginName) => {
      Object.keys(this.credentials[pluginName]).forEach((credentialKey) => {
        result = result.replace(
          `{${credentialKey}}`,
          this.getCredential(pluginName, credentialKey) || ''
        );
      });
    });

    return result;
  }
}

export default CredentialsService.getInstance();
