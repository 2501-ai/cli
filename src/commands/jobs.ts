import axios from 'axios';

import { listAgentsFromWorkspace, readConfig } from '../utils/conf';
import {
  ERRORFILE_PATH,
  hasError,
  LOGFILE_PATH,
  run_shell,
} from '../utils/actions';

import { queryCommand } from './query';

import { API_HOST, API_VERSION } from '../constants';
import { unixSourceCommand } from '../utils/shell-commands';
import { Logger } from '../utils/logger';

export async function jobSubscriptionCommand(options: {
  subscribe?: boolean;
  workspace?: string;
  listen?: boolean;
}): Promise<void> {
  const workspace = options.workspace || process.cwd();
  if (options.subscribe) {
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
    });
    if (hasError(soureCommandOutput)) {
      return Logger.error(soureCommandOutput);
    }
    const crontabOutput = await run_shell({
      shell: true,
      command: `(crontab -l 2>/dev/null; echo "* * * * * ${shellOutput} -c \\"${soureCommandOutput} && cd ${workspace} && @2501 jobs --listen\\" >> ${LOGFILE_PATH} 2>>${ERRORFILE_PATH}") | crontab -`,
    });
    if (hasError(crontabOutput)) {
      return Logger.error('crontabOutput', crontabOutput);
    }
    return Logger.log('Subscribed to the API for new jobs');
  }

  if (options.listen) {
    try {
      const workspace = options.workspace || process.cwd();
      const config = readConfig();

      const [agent] = await listAgentsFromWorkspace(workspace);

      if (!agent) {
        Logger.warn('No agents available in the workspace');
      }

      Logger.log(`Listening for new jobs for agent ${agent.id}`);
      const response = await axios.get(
        `${API_HOST}${API_VERSION}/agents/${agent.id}/jobs?status=todo`,
        { headers: { Authorization: `Bearer ${config?.api_key}` } }
      );

      const jobs = response.data;
      if (!jobs.length) {
        Logger.log('No jobs to execute');
        return;
      }

      Logger.log(`Found ${jobs.length} jobs to execute`);
      const shell_user = await run_shell({ command: `whoami` });
      const localIP = await run_shell({ command: `hostname -I` });

      for (const idx in jobs) {
        Logger.log(`Executing job ${idx} : "${jobs[idx].brief}"`);
        await axios.put(
          `${API_HOST}${API_VERSION}/jobs/${jobs[idx].id}`,
          {
            status: 'in_progress',
            host: `${shell_user.trim()}@${localIP.trim()}`,
          },
          { headers: { Authorization: `Bearer ${config?.api_key}` } }
        );
        await queryCommand(jobs[idx].brief, {
          callback: async (response: unknown) => {
            await axios.put(
              `${API_HOST}${API_VERSION}/jobs/${jobs[idx].id}`,
              { status: 'completed', result: response },
              { headers: { Authorization: `Bearer ${config?.api_key}` } }
            );
          },
        });
      }
    } catch (error) {
      Logger.error(error);
    }
  }
}
