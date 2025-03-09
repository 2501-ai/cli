import fs from 'fs';
import path from 'path';
import Logger from './logger';
import { PluginsConfig } from './types';
class PluginService {
  private pluginsPath: string | null = null;
  private plugins: PluginsConfig = {};
  private static instance: PluginService;

  private constructor() {}

  public static getInstance(): PluginService {
    if (!PluginService.instance) {
      PluginService.instance = new PluginService();
    }
    return PluginService.instance;
  }

  public initialize(pluginsPath: string): void {
    if (!pluginsPath) {
      Logger.debug('No plugins path provided');
      return;
    }

    try {
      const resolvedPath = path.resolve(pluginsPath);
      if (!fs.existsSync(resolvedPath)) {
        Logger.debug(`Plugins file not found at ${resolvedPath}`);
        return;
      }

      this.pluginsPath = resolvedPath;
      const pluginsContent = fs.readFileSync(resolvedPath, 'utf-8');
      this.plugins = JSON.parse(pluginsContent);
      Logger.debug('Plugins loaded successfully');
    } catch (error) {
      Logger.debug(`Error loading plugins: ${error}`);
    }
  }

  public getPlugins(): any {
    return this.plugins;
  }
}

export default PluginService.getInstance();
