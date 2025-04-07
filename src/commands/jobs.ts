import axios from 'axios';

import { API_HOST, API_VERSION } from '../constants';

import {
  ERRORFILE_PATH,
  hasError,
  LOGFILE_PATH,
  run_shell,
} from '../helpers/actions';

import { queryCommand } from './query';

import { listAgentsFromWorkspace } from '../utils/conf';
import { unixSourceCommand } from '../utils/shellCommands';
import Logger from '../utils/logger';

export async function jobSubscriptionCommand(options: {
  subscribe?: boolean;
  unsubscribe?: boolean;
  workspace?: string;
  listen?: boolean;
}): Promise<void> {
  const logger = new Logger();
  const workspace = options.workspace || process.cwd();
  console.log('Step: Initialized logger and workspace');

  logger.intro('2501 - Jobs Subscription');
  console.log('Step: Displayed intro message');

  if (options.subscribe) {
    logger.start('Subscribing for new jobs');
    console.log('Step: Starting subscription process');

    const shellOutput = await run_shell({
      command: `echo $SHELL`,
      shell: true,
    });
    console.log('Step: Retrieved shell information');

    if (hasError(shellOutput)) {
      return Logger.error(shellOutput);
    }

    const soureCommandOutput = await run_shell({
      command: unixSourceCommand,
      shell: shellOutput,
    }); // returns smth like 'source ~/.zshrc'
    console.log('Step: Got source command output');

    if (hasError(soureCommandOutput)) {
      return Logger.error(soureCommandOutput);
    }

    const crontabOutput = await run_shell({
      shell: true,
      command: `(crontab -l 2>/dev/null || echo "") | grep -v "cd ${workspace} && .*@2501 jobs --listen" | (cat && echo "* * * * * cd ${workspace} && ${soureCommandOutput.trim()} && @2501 jobs --listen --workspace ${workspace} > ${LOGFILE_PATH} 2> ${ERRORFILE_PATH}") | crontab -`,
    });
    console.log('Step: Set up crontab job subscription');

    if (hasError(crontabOutput)) {
      return Logger.error('crontabOutput', crontabOutput);
    }

    console.log('Step: Subscription completed successfully');
    return logger.stop(
      `Subscribed to the API for new jobs on workspace ${workspace}`
    );
  }

  if (options.unsubscribe) {
    logger.start('Unsubscribing for new jobs');
    console.log('Step: Starting unsubscription process');

    const crontabOutput = await run_shell({
      shell: true,
      command: `crontab -l | grep -v "cd ${workspace} && .*@2501 jobs --listen" | crontab -`,
    });
    console.log('Step: Removed crontab job subscription');

    if (hasError(crontabOutput)) {
      return Logger.error('crontabOutput', crontabOutput);
    }

    console.log('Step: Unsubscription completed successfully');
    return logger.stop(
      `Unsubscribed to the API for new jobs on workspace ${workspace}`
    );
  }

  if (options.listen) {
    try {
      const workspace = options.workspace || process.cwd();
      console.log('Step: Set workspace for listen mode');

      const [agent] = listAgentsFromWorkspace(workspace);
      console.log('Step: Retrieved agents from workspace');

      if (!agent) {
        return logger.outro('No agents available in the workspace');
      }

      logger.log(`Listening for new jobs on ${workspace}`);
      console.log('Step: Starting to listen for jobs');

      const response = await axios.get(
        `${API_HOST}${API_VERSION}/agents/${agent.id}/jobs?status=todo`
      );
      console.log('Step: Retrieved jobs from API');

      const jobs = response.data;
      if (!jobs || !jobs.length) {
        logger.outro('No jobs found');
        console.log('Step: No jobs found, exiting');
        return;
      }

      const shell_user = await run_shell({ command: `whoami` });
      console.log('Step: Got current user');

      const localIP = await run_shell({ command: `hostname -I` });
      console.log('Step: Got local IP address');

      logger.log(`Found ${jobs.length} jobs to execute`);
      console.log(`Step: Processing ${jobs.length} jobs`);

      for (const idx in jobs) {
        console.log(
          `Step: Updating job ${parseInt(idx) + 1}/${jobs.length} to in_progress`
        );
        await axios.put(`${API_HOST}${API_VERSION}/jobs/${jobs[idx].id}`, {
          status: 'in_progress',
          host: `${shell_user.trim()}@${localIP.trim()}`,
        });
        console.log(`Step: Executing job ${parseInt(idx) + 1}/${jobs.length}`);

        await queryCommand(jobs[idx].brief, {
          callback: async (response: unknown) => {
            console.log(
              `Step: Completing job ${parseInt(idx) + 1}/${jobs.length}`
            );
            await axios.put(`${API_HOST}${API_VERSION}/jobs/${jobs[idx].id}`, {
              status: 'completed',
              result: response,
            });
            console.log(
              `Step: Job ${parseInt(idx) + 1}/${jobs.length} completed`
            );
          },
        });
      }
      console.log('Step: All jobs processed successfully');
    } catch (error) {
      console.log('Step: Error occurred during job processing');
      Logger.error('Jobs error:', error);
    }
  }
}
