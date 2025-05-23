import fs from 'fs';
import path from 'path';
import Logger from './logger';
import { PluginsConfig } from './types';
import { CONFIG_DIR } from '../constants';
import { Command } from 'commander';

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

    const resolvedPath = path.resolve(pluginsPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Plugins file not found at ${resolvedPath}`);
    }

    this.pluginsPath = resolvedPath;
    const pluginsContent = fs.readFileSync(resolvedPath, 'utf-8');
    this.plugins = JSON.parse(pluginsContent);
    Logger.debug(this.plugins);
    Logger.debug('Plugins loaded successfully');
  }

  public getPlugins(): any {
    return this.plugins;
  }
}

export const pluginService = PluginService.getInstance();

export const initPlugins = async (
  thisCommand: Command,
  actionCommand: Command
) => {
  const defaultPluginsPath = path.join(CONFIG_DIR, 'plugins.json');
  const options = actionCommand.opts();

  if (options.plugins) {
    pluginService.initialize(options.plugins);
  } else if (fs.existsSync(defaultPluginsPath)) {
    pluginService.initialize(defaultPluginsPath);
  }
};
