import path from 'path';
import fs from 'fs';

import { IGNORED_FILE_PATTERNS } from '../constants';
import Logger from './logger';

type IgnorePattern = {
  exactMatch: string | null;
  regex: RegExp | null;
};

/**
 * Ignore manager class to handle file ignore patterns properly.
 */
export class IgnoreManager {
  private static instance: IgnoreManager;

  private exactMatches: Set<string>;
  private regexPatterns: RegExp[];
  private gitignoreCache: Map<string, boolean>; // Cache for gitignore results

  public static getInstance(): IgnoreManager {
    if (!IgnoreManager.instance) {
      IgnoreManager.instance = new IgnoreManager();
    }
    return IgnoreManager.instance;
  }

  constructor(basePatterns: string[] = IGNORED_FILE_PATTERNS) {
    this.exactMatches = new Set();
    this.regexPatterns = [];
    this.gitignoreCache = new Map();
    this.addPatterns(basePatterns);
  }

  private parsePattern(pattern: string): IgnorePattern {
    // Skip empty lines and comments
    if (!pattern || pattern.startsWith('#')) {
      return { exactMatch: null, regex: null };
    }

    // Normalize pattern: remove leading ./ and trailing /
    pattern = pattern.replace(/^\.\//, '').replace(/\/$/, '');

    // If pattern is a simple string without special characters
    if (
      !pattern.includes('*') &&
      !pattern.includes('?') &&
      !pattern.includes('(?:')
    ) {
      return { exactMatch: pattern, regex: null };
    }

    // Convert pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.') // Escape dots
      .replace(/\*/g, '.*') // Convert * to .*
      .replace(/\?/g, '.'); // Convert ? to .

    return { exactMatch: null, regex: new RegExp(`^${regexPattern}$`) };
  }

  public addPatterns(patterns: string[], relativePath: string = ''): void {
    // Normalize relative path: ensure it ends with / if not empty
    const normalizedRelativePath = relativePath
      ? relativePath.replace(/\\/g, '/').replace(/\/?$/, '/')
      : '';

    // Deduplicate and process patterns
    const uniquePatterns = [...new Set(patterns)];

    uniquePatterns.forEach((pattern) => {
      // Skip empty patterns
      if (!pattern) return;

      // Prepend relative path to pattern if it doesn't start with /
      const fullPattern = !pattern.startsWith('/')
        ? `${normalizedRelativePath}${pattern}`
        : pattern.slice(1); // Remove leading / for absolute patterns

      const parsed = this.parsePattern(fullPattern);
      if (parsed.exactMatch) {
        this.exactMatches.add(parsed.exactMatch);
      } else if (parsed.regex) {
        // Avoid adding duplicate regex patterns
        const regexStr = parsed.regex.toString();
        if (!this.regexPatterns.some((r) => r.toString() === regexStr)) {
          this.regexPatterns.push(parsed.regex);
        }
      }
    });
  }

  public loadGitignore(gitignorePath: string): void {
    try {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      const patterns = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '' && !line.startsWith('#'));

      // Get the relative path from the gitignore location
      // Use relative path instead of absolute path
      const relativePath = path
        .dirname(gitignorePath)
        .replace(process.cwd(), '') // Remove the current working directory
        .replace(/^\//, ''); // Remove leading slash

      this.addPatterns(patterns, relativePath);
    } catch (e) {
      Logger.error(`Error reading .gitignore at ${gitignorePath}:`, e);
    }
  }

  public isIgnored(filepath: string): boolean {
    // Normalize path to use forward slashes and remove leading ./
    const normalizedPath = filepath.replace(/\\/g, '/').replace(/^\.\//, '');

    // Check cache first
    const cacheResult = this.gitignoreCache.get(normalizedPath);
    if (cacheResult !== undefined) {
      return cacheResult;
    }

    // Fast path: check exact matches
    if (this.exactMatches.has(normalizedPath)) {
      this.gitignoreCache.set(normalizedPath, true);
      return true;
    }

    // Check regex patterns against the full path
    const isIgnored = this.regexPatterns.some((regex) =>
      regex.test(normalizedPath)
    );
    this.gitignoreCache.set(normalizedPath, isIgnored);
    return isIgnored;
  }

  public clear(): void {
    this.exactMatches.clear();
    this.regexPatterns = [];
    this.gitignoreCache.clear();
  }
}
