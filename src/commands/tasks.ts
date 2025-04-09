import {
  ERRORFILE_PATH,
  hasError,
  LOGFILE_PATH,
  run_shell,
} from '../helpers/actions';
import { getTasks, updateTask } from '../helpers/api';
import { resolveWorkspacePath } from '../helpers/workspace';
import { getEligibleAgent } from '../utils/conf';
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

    const whichNode = await run_shell({
      command: `which node`,
      shell: true,
    });
    if (hasError(whichNode)) {
      return Logger.error(whichNode);
    }

    const whichTFZO = await run_shell({
      command: `which @2501`,
      shell: true,
    });
    if (hasError(whichTFZO)) {
      return Logger.error(whichTFZO);
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
      command: `(crontab -l 2>/dev/null; echo "* * * * * ${shellOutput} -c \\"${soureCommandOutput} && cd ${workspace} && ${whichNode} ${whichTFZO} tasks --listen\\" >> ${LOGFILE_PATH} 2>>${ERRORFILE_PATH}") | crontab -`,
    });

    if (hasError(crontabOutput)) {
      return Logger.error('crontabOutput', crontabOutput);
    }

    return logger.stop(
      `Subscribed to the API for new tasks on workspace ${workspace}`
    );
  }

  if (options.unsubscribe) {
    logger.start('Unsubscribing for new jobs');

    const crontabOutput = await run_shell({
      shell: true,
      command: `crontab -l | grep -v "cd ${workspace} && .*@2501 tasks --listen" | crontab -`,
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
      const agent = getEligibleAgent(workspace);
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

      // TODO: what is the purpose of this??
      // const shell_user = await run_shell({ command: `whoami` });
      // console.log('Step: Got current user');

      // const localIP = await run_shell({ command: `hostname -I` });
      // console.log('Step: Got local IP address');

      logger.log(`Found ${tasks.length} tasks to execute`);

      for (const idx in tasks) {
        Logger.log(`Processing task ${tasks[idx].id}`);
        // The engine will update the task as in_progress.
        await queryCommand(tasks[idx].brief, {
          workspace,
          agentId: agent.id,
          taskId: tasks[idx].id,
        }).catch(async (error) => {
          // Update the task as failed if the error comes from the CLI side.
          await updateTask(agent.id, tasks[idx].id, {
            status: 'failed',
            result: `CLI Error: ${error}`,
          });
          Logger.error(`Task ${tasks[idx].id} failed: ${error}`);
        });
      }
      Logger.log('All tasks have been processed');
    } catch (error) {
      Logger.error('Tasks error:', error);
    }
  }
}
