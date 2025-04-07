import axios from 'axios';

import { API_HOST, API_VERSION } from '../constants';

import { run_shell } from '../helpers/actions';

import { queryCommand } from './query';

import { listAgentsFromWorkspace } from '../utils/conf';
import Logger from '../utils/logger';

// Global variable to track if polling process is running
let isPolling = false;
let pollTimer: NodeJS.Timeout | null = null;

// Function to process jobs - extracted common logic
async function processJobs(jobs: any[], logger: Logger): Promise<void> {
  const shell_user = await run_shell({ command: `whoami` });
  const localIP = await run_shell({ command: `hostname -I` }); // doesn't work

  logger.stop(`Found ${jobs.length} jobs to execute`);

  for (const idx in jobs) {
    // Update job status to in_progress
    await axios.put(`${API_HOST}${API_VERSION}/jobs/${jobs[idx].id}`, {
      status: 'in_progress',
      host: `${shell_user.trim()}@${localIP.trim()}`,
    });

    await queryCommand(jobs[idx].brief, {
      callback: async (response: unknown) => {
        // Update job status to completed
        // TODO: also handle failed status
        await axios.put(`${API_HOST}${API_VERSION}/jobs/${jobs[idx].id}`, {
          status: 'completed',
          result: response,
        });
      },
    });
  }
}

// Function to poll for jobs and execute them
async function pollJobs(workspace: string): Promise<void> {
  const logger = new Logger();

  try {
    if (!isPolling) {
      return; // Exit if polling has been stopped
    }

    const [agent] = listAgentsFromWorkspace(workspace);

    if (!agent) {
      logger.outro('No agents available in the workspace');
      stopPolling();
      return;
    }

    logger.start(`Checking for new jobs on ${workspace}`);

    const response = await axios.get(
      `${API_HOST}${API_VERSION}/agents/${agent.id}/jobs?status=todo`
    );

    const jobs = response.data;
    if (!jobs || !jobs.length) {
      logger.stop('No jobs found');

      // Schedule next poll
      if (isPolling) {
        pollTimer = setTimeout(() => pollJobs(workspace), 30000);
      }
      return;
    }

    // Temporarily pause polling while executing jobs
    isPolling = false;

    await processJobs(jobs, logger);

    // Resume polling after job execution
    isPolling = true;
    pollTimer = setTimeout(() => pollJobs(workspace), 30000);
  } catch (error) {
    Logger.error('Jobs error:', error);
    // On error, continue polling
    if (isPolling) {
      pollTimer = setTimeout(() => pollJobs(workspace), 30000);
    }
  }
}

// Function to stop polling
function stopPolling(): void {
  isPolling = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

export async function jobSubscriptionCommand(options: {
  subscribe?: boolean;
  unsubscribe?: boolean;
  workspace?: string;
  listen?: boolean;
}): Promise<void> {
  const logger = new Logger();
  const workspace = options.workspace || process.cwd();

  logger.intro('2501 - Jobs Subscription');

  if (options.subscribe) {
    // If already polling, stop the current polling
    if (isPolling) {
      stopPolling();
      logger.log('Stopped previous job subscription');
    }

    logger.start('Starting job subscription');

    // Set up polling
    isPolling = true;
    pollJobs(workspace);

    return logger.stop(
      `Subscribed to the API for new jobs on workspace ${workspace}. Polling every 30 seconds.`
    );
  }

  if (options.listen) {
    try {
      const workspace = options.workspace || process.cwd();

      const [agent] = listAgentsFromWorkspace(workspace);

      if (!agent) {
        return logger.outro('No agents available in the workspace');
      }

      logger.start(`Listening for new jobs on ${workspace}`);

      const response = await axios.get(
        `${API_HOST}${API_VERSION}/agents/${agent.id}/jobs?status=todo`
      );

      const jobs = response.data;
      if (!jobs || !jobs.length) {
        logger.outro('No jobs found');
        return;
      }

      await processJobs(jobs, logger);
    } catch (error) {
      Logger.error('Jobs error:', error);
    }
  }
}
