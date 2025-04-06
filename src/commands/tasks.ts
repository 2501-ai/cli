import axios from 'axios';

import { API_HOST, API_VERSION } from '../constants';
import {
  ERRORFILE_PATH,
  hasError,
  LOGFILE_PATH,
  run_shell,
} from '../helpers/actions';
import { getTasks } from '../helpers/api';
import { resolveWorkspacePath } from '../helpers/workspace';
import { listAgentsFromWorkspace } from '../utils/conf';
import Logger from '../utils/logger';
import { unixSourceCommand } from '../utils/shellCommands';
import { queryCommand } from './query';

export async function tasksSubscriptionCommand(options: {
  subscribe?: boolean;
  unsubscribe?: boolean;
  workspace?: string;
  listen?: boolean;
}): Promise<void> {
  const logger = new Logger();
  const workspace = resolveWorkspacePath(options);

  logger.intro('2501 - Tasks Subscription');

  if (options.subscribe) {
    logger.start('Subscribing for new tasks');
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
      command: `(crontab -l 2>/dev/null; echo "* * * * * ${shellOutput} -c \\"${soureCommandOutput} && cd ${workspace} && @2501 tasks --listen\\" >> ${LOGFILE_PATH} 2>>${ERRORFILE_PATH}") | crontab -`,
    });
    if (hasError(crontabOutput)) {
      return Logger.error('crontabOutput', crontabOutput);
    }
    return logger.stop(
      `Subscribed to the API for new tasks on workspace ${workspace}`
    );
  }

  if (options.unsubscribe) {
    logger.start('Unsubscribing for new tasks');
    const crontabOutput = await run_shell({
      shell: true,
      command: `crontab -l | grep -v "cd ${workspace} && @2501 tasks --listen" | crontab -`,
    });
    if (hasError(crontabOutput)) {
      return Logger.error('crontabOutput', crontabOutput);
    }
    return logger.stop(
      `Unsubscribed to the API for new tasks on workspace ${workspace}`
    );
  }

  if (options.listen) {
    try {
      const [agent] = listAgentsFromWorkspace(workspace);

      if (!agent) {
        return logger.outro('No agents available in the workspace');
      }

      logger.start(`Listening for new tasks on ${workspace}`);

      const status = 'assigned';
      const tasks = await getTasks(agent.id, status);

      if (!tasks.length) {
        logger.outro('No tasks found');
        return;
      }

      const shell_user = await run_shell({ command: `whoami` });
      const localIP = await run_shell({ command: `hostname -I` });

      logger.stop(`Found ${tasks.length} tasks to execute`);
      for (const idx in tasks) {
        await axios.put(`${API_HOST}${API_VERSION}/tasks/${tasks[idx].id}`, {
          status: 'in_progress',
          host: `${shell_user.trim()}@${localIP.trim()}`,
        });
        await queryCommand(tasks[idx].brief, {
          callback: async (response: unknown) => {
            await axios.put(
              `${API_HOST}${API_VERSION}/tasks/${tasks[idx].id}`,
              {
                status: 'completed',
                result: response,
              }
            );
          },
        });
      }
    } catch (error) {
      Logger.error('Tasks error:', error);
    }
  }
}
