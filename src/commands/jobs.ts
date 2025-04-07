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

  logger.intro('2501 - Jobs Subscription');

  if (options.subscribe) {
    logger.start('Subscribing for new jobs');

    const shellOutput = await run_shell({
      command: `echo $SHELL`,
      shell: true,
    });

    if (hasError(shellOutput)) {
      return Logger.error(shellOutput);
    }

    const soureCommandOutput = await run_shell({
      command: unixSourceCommand,
      shell: shellOutput,
    }); // returns smth like 'source ~/.zshrc'

    if (hasError(soureCommandOutput)) {
      return Logger.error(soureCommandOutput);
    }

    const crontabOutput = await run_shell({
      shell: true,
      command: `(crontab -l 2>/dev/null || echo "") | grep -v "cd ${workspace} && .*@2501 jobs --listen" | (cat && echo "* * * * * cd ${workspace} && ${soureCommandOutput.trim()} && @2501 jobs --listen --workspace ${workspace} > ${LOGFILE_PATH} 2> ${ERRORFILE_PATH}") | crontab -`,
    });

    if (hasError(crontabOutput)) {
      return Logger.error('crontabOutput', crontabOutput);
    }

    return logger.stop(
      `Subscribed to the API for new jobs on workspace ${workspace}`
    );
  }

  if (options.unsubscribe) {
    logger.start('Unsubscribing for new jobs');

    const crontabOutput = await run_shell({
      shell: true,
      command: `crontab -l | grep -v "cd ${workspace} && .*@2501 jobs --listen" | crontab -`,
    });

    if (hasError(crontabOutput)) {
      return Logger.error('crontabOutput', crontabOutput);
    }

    return logger.stop(
      `Unsubscribed to the API for new jobs on workspace ${workspace}`
    );
  }

  if (options.listen) {
    try {
      const workspace = options.workspace || process.cwd();

      const [agent] = listAgentsFromWorkspace(workspace);

      if (!agent) {
        return logger.outro('No agents available in the workspace');
      }

      logger.log(`Listening for new jobs on ${workspace}`);

      const response = await axios.get(
        `${API_HOST}${API_VERSION}/agents/${agent.id}/jobs?status=todo`
      );

      const jobs = response.data;
      if (!jobs || !jobs.length) {
        logger.outro('No jobs found');
        return;
      }

      const shell_user = await run_shell({ command: `whoami` });

      const localIP = await run_shell({ command: `hostname -I` });

      logger.log(`Found ${jobs.length} jobs to execute`);

      for (const idx in jobs) {
        try {
          await axios.put(`${API_HOST}${API_VERSION}/jobs/${jobs[idx].id}`, {
            status: 'in_progress',
            host: `${shell_user.trim()}@${localIP.trim()}`,
          });

          await queryCommand(jobs[idx].brief, {
            callback: async (response: unknown) => {
              await axios.put(
                `${API_HOST}${API_VERSION}/jobs/${jobs[idx].id}`,
                {
                  status: 'completed',
                  result: response,
                }
              );
            },
          });
        } catch (jobError) {
          try {
            await axios.put(`${API_HOST}${API_VERSION}/jobs/${jobs[idx].id}`, {
              status: 'failed',
              result:
                jobError instanceof Error ? jobError.message : String(jobError),
            });
          } catch (updateError) {
            Logger.error(
              `Failed to update job ${jobs[idx].id} status:`,
              updateError
            );
          }

          Logger.error(`Job ${jobs[idx].id} failed:`, jobError);
        }
      }
    } catch (error) {
      Logger.error('Jobs error:', error);
    }
  }
}
