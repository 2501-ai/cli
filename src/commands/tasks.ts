import {
  ERRORFILE_PATH,
  hasError,
  LOG_DIR,
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
    }); // returns smth like 'source ~/.zshrc'

    if (hasError(soureCommandOutput)) {
      return Logger.error(soureCommandOutput);
    }

    const crontabOutput = await run_shell({
      shell: true,
      command: `(crontab -l 2>/dev/null; echo "* * * * * mkdir -p ${LOG_DIR} && ${shellOutput} -c \\"${soureCommandOutput} && cd ${workspace} && ${whichNode} ${whichTFZO} tasks --listen\\" >> ${LOGFILE_PATH} 2>>${ERRORFILE_PATH}") | crontab -`,
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
      command: `crontab -l | grep -v "cd ${workspace} && ${whichNode} ${whichTFZO} tasks --listen" | crontab -`,
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

      // A spinner start requires a stop before returning.
      logger.start();
      logger.log(`Listening for new tasks on ${workspace}`);

      const status = 'assigned';
      logger.log(
        `Retrieving tasks for agent ${agent.id} with status ${status}`
      );
      const tasks = await getTasks(agent.id, status);

      if (!tasks.length) {
        logger.stop(`No tasks found`);
        return;
      }

      logger.log(`Found ${tasks.length} tasks to execute`);

      for (const idx in tasks) {
        logger.log(`Processing task ${tasks[idx].id}`);
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
      logger.log('All tasks have been processed');
    } catch (error) {
      Logger.error('Tasks error:', error);
    }
    // Make sure the logger spinner is stopped.
    logger.stop();
  }
}
