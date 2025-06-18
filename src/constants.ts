import os from 'os';
import path from 'path';
import { StreamEvent } from './utils/types';

let API_HOST_VALUE = 'https://engine.2501.ai';

if (process.env.TFZO_API_HOST) {
  API_HOST_VALUE = process.env.TFZO_API_HOST;
} else if (process.env.TFZO_NODE_ENV === 'dev') {
  API_HOST_VALUE = 'http://localhost:1337';
} else if (process.env.TFZO_NODE_ENV === 'staging') {
  API_HOST_VALUE = 'https://staging.engine.2501.ai';
}

export const API_HOST = API_HOST_VALUE;

export const API_VERSION = '/api/v1';

export const CONFIG_DIR = path.join(os.homedir(), '.2501');

export enum QueryStatus {
  // Engine Statuses:
  Idle = 'idle',
  // Async Statuses:
  Queued = 'queued',
  InProgress = 'in_progress',
  RequiresAction = 'requires_action',
  Cancelling = 'cancelling',
  Cancelled = 'cancelled',
  Failed = 'failed',
  Completed = 'completed',
  Incomplete = 'incomplete',
  Expired = 'expired',
}

export const DISABLE_SPINNER = process.env.TFZO_DISABLE_SPINNER === 'true';

export const IGNORED_WINDOWS_FILE_EXTENSIONS = [
  '.exe',
  '.dll',
  '.msi',
  '.com',
  '.scr',
  '.pif',
];

export const IGNORED_WINDOWS_FILE_NAMES = [
  'desktop.ini',
  'thumbs.db',
  '~$*', // Office temp files
  '*.tmp',
  '*.temp',
  '*.lnk', // Windows shortcuts
];

export const IGNORED_FILE_PATTERNS = [
  '.env',
  '.git',
  'venv',
  '__pycache__',
  'yarn.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn-error.log',
  'node_modules',
  'build',
  'dist',
  '*.log',
  'out',
  '.DS_Store',
  'Thumbs.db',
  '.cache',
  '.idea',
  '.Trash',
  '*.tmp',
  '*.temp',
  '.svn',
  '.svg',
  '.hg',
  'vendor',
  '*.pyc',
  '__pycache__',
  'bin',
  'obj',
  '*.class',
  '*.bak',
  '*.swp',
  '*.env.local',
  '*.env.development',
  '*.env.production',
  'secrets.json',
  'credentials.xml',
  '(?:^|/).[^/]*$', // Ignore directories starting with .
  ...IGNORED_WINDOWS_FILE_EXTENSIONS,
  ...IGNORED_WINDOWS_FILE_NAMES,
];

// We don't want to include Microsoft files, as these are proprietary binary files.
export const INCLUDED_FILE_EXTENSIONS = [
  '.tf',
  '.tfvars',
  '.tfstate',
  '.tfstate.backup',
  '.ps1',
  '.sh',
  '.bat',
  '.cmd',
];

export const DEFAULT_MAX_DEPTH = 5;
export const DEFAULT_MAX_DIR_SIZE = 50 * 1024 * 1024; // 50 MB

export const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export const DEFAULT_ACTIONS_REPONSE: StreamEvent = {
  status: 'requires_action',
  message: 'Action required',
  actions: [],
  usage: null,
};

export const BLACKLISTED_COMMANDS = ['nano', 'vim', 'vi', 'nvim'];
