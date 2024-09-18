import axios from 'axios';

if (process.env.AUTH_JWT) {
  axios.defaults.headers.common['Cookie'] =
    `_vercel_jwt=${process.env.AUTH_JWT}`;
}

export const API_HOST =
  process.env.NODE_ENV === 'dev'
    ? 'http://localhost:1337'
    : process.env.NODE_ENV === 'staging'
      ? 'https://staging.engine.2501.ai'
      : 'https://engine.2501.ai';

export const API_VERSION = '/api/v1';

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

export const ASYNC_TERMINAL_STATUSES: QueryStatus[] = [
  QueryStatus.Completed,
  QueryStatus.Failed,
  QueryStatus.Expired,
  QueryStatus.Incomplete,
  QueryStatus.Cancelled,
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
];
