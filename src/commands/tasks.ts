import os from 'os';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

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

async function getTfzoExecPath(): Promise<string | null> {
  const whichCommand = os.platform() === 'win32' ? 'where' : 'which';

  const whichNode = await run_shell({
    command: `${whichCommand} node`,
    shell: true,
  });

  if (hasError(whichNode)) {
    Logger.error(whichNode);
    return null;
  }

  // On Windows, explicitly look for the .cmd file to avoid Unix shell script
  const binary = os.platform() === 'win32' ? 'a2501.cmd' : '@2501';
  const whichTFZO = await run_shell({
    command: `${whichCommand} ${binary}`,
    shell: true,
  });

  if (hasError(whichTFZO)) {
    Logger.error(whichTFZO);
    return null;
  }

  return `${whichNode.trim()} ${whichTFZO.trim()}`;
}

/**
 * Subscribe to tasks using Unix crontab
 */
async function subscribeUnix(
  workspace: string,
  tfzoExecPath: string
): Promise<string | null> {
  const shellOutput = await run_shell({
    command: `echo $SHELL`,
    shell: true,
  });

  if (hasError(shellOutput)) {
    return shellOutput;
  }

  const sourceCommandOutput = await run_shell({
    command: unixSourceCommand,
    shell: shellOutput,
  });

  if (hasError(sourceCommandOutput)) {
    return sourceCommandOutput;
  }

  const crontabOutput = await run_shell({
    shell: true,
    command: `(crontab -l 2>/dev/null; echo "* * * * * mkdir -p ${LOG_DIR} && ${shellOutput} -c \\"${sourceCommandOutput} && cd ${workspace} && ${tfzoExecPath} tasks --listen\\" >> ${LOGFILE_PATH} 2>>${ERRORFILE_PATH}") | crontab -`,
  });

  if (hasError(crontabOutput)) {
    return crontabOutput;
  }

  return null;
}

/**
 * Unsubscribe from tasks using Unix crontab
 */
async function unsubscribeUnix(
  workspace: string,
  tfzoExecPath: string
): Promise<string | null> {
  const crontabOutput = await run_shell({
    shell: true,
    command: `crontab -l | grep -v "cd ${workspace} && ${tfzoExecPath} tasks --listen" | crontab -`,
  });

  if (hasError(crontabOutput)) {
    return crontabOutput;
  }

  return null;
}

/**
 * Generate a unique task name based on workspace path
 */
function generateTaskName(workspace: string): string {
  // Create a short hash of the full workspace path for uniqueness
  const hash = crypto
    .createHash('md5')
    .update(workspace)
    .digest('hex')
    .substring(0, 8);
  const baseName = path.basename(workspace);
  return `2501-tasks-listener-${baseName}-${hash}`;
}

/**
 * Subscribe to tasks using Windows Task Scheduler
 */
async function subscribeWindows(
  workspace: string,
  tfzoExecPath: string
): Promise<string | null> {
  const taskName = generateTaskName(workspace);
  const logDir = LOG_DIR.replace(/\//g, '\\');
  const logFile = LOGFILE_PATH.replace(/\//g, '\\');
  const errorFile = ERRORFILE_PATH.replace(/\//g, '\\');

  // Ensure log directory exists using Node.js fs
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (error) {
    return `Failed to create log directory: ${error}`;
  }

  // Create batch file in permanent location (not temp)
  const appDataDir = path.join(os.homedir(), 'AppData', 'Local', '2501');
  const permanentBatchFile = path.join(appDataDir, `${taskName}.bat`);

  // Use timestamped log files to avoid file locking conflicts
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .substring(0, 16); // YYYY-MM-DDTHH-MM
  const timestampedLogFile = logFile.replace('.log', `-${timestamp}.log`);
  const timestampedErrorFile = errorFile.replace('.log', `-${timestamp}.log`);

  // Get current PATH to preserve in scheduled task
  const currentPath = process.env.PATH || '';

  // Write batch file using Node.js fs - much simpler and reliable
  // For Windows, use the .cmd file directly, not through node.exe
  const scriptPath = tfzoExecPath.split(' ').slice(1).join(' ');

  const batchContent = `@echo off
REM Preserve current user environment for scheduled task
set "PATH=${currentPath}"

REM Change to workspace directory
cd /d "${workspace}"

REM Run the task - execute .cmd file directly
"${scriptPath}" tasks --listen >> "${timestampedLogFile}" 2>> "${timestampedErrorFile}"`;

  try {
    // Create directory if it doesn't exist
    fs.mkdirSync(appDataDir, { recursive: true });

    // Write the batch file
    fs.writeFileSync(permanentBatchFile, batchContent, 'utf8');
  } catch (error) {
    return `Failed to create batch file: ${error}`;
  }

  // Schedule the batch file from permanent location
  const schtasksOutput = await run_shell({
    shell: true,
    command: `schtasks /create /tn "${taskName}" /tr "${permanentBatchFile}" /sc minute /mo 1 /f`,
  });

  if (hasError(schtasksOutput)) {
    return schtasksOutput;
  }

  return null;
}

/**
 * Unsubscribe from tasks using Windows Task Scheduler
 */
async function unsubscribeWindows(workspace: string): Promise<string | null> {
  const taskName = generateTaskName(workspace);
  const appDataDir = path.join(os.homedir(), 'AppData', 'Local', '2501');
  const permanentBatchFile = path.join(appDataDir, `${taskName}.bat`);

  // Delete the scheduled task
  const schtasksOutput = await run_shell({
    shell: true,
    command: `schtasks /delete /tn "${taskName}" /f`,
  });

  if (hasError(schtasksOutput)) {
    return schtasksOutput;
  }

  // Clean up batch file using Node.js fs
  try {
    if (fs.existsSync(permanentBatchFile)) {
      fs.unlinkSync(permanentBatchFile);
    }
  } catch (error) {
    // Don't fail the unsubscribe if file cleanup fails
    console.warn(`Warning: Could not delete batch file: ${error}`);
  }

  return null;
}

/**
 * Platform-agnostic task subscription
 */
async function subscribeToTasks(
  workspace: string,
  tfzoExecPath: string
): Promise<string | null> {
  const isWindows = os.platform() === 'win32';
  return isWindows
    ? await subscribeWindows(workspace, tfzoExecPath)
    : await subscribeUnix(workspace, tfzoExecPath);
}

/**
 * Platform-agnostic task unsubscription
 */
async function unsubscribeFromTasks(
  workspace: string,
  tfzoExecPath: string
): Promise<string | null> {
  const isWindows = os.platform() === 'win32';
  return isWindows
    ? await unsubscribeWindows(workspace)
    : await unsubscribeUnix(workspace, tfzoExecPath);
}

export async function tasksSubscriptionCommand(options: {
  subscribe?: boolean;
  unsubscribe?: boolean;
  workspace?: string;
  listen?: boolean;
}): Promise<void> {
  const logger = new Logger();
  const workspace = resolveWorkspacePath(options);

  logger.intro('2501 - Tasks Subscription');

  const tfzoExecPath = await getTfzoExecPath();

  // Handle case where getTfzoExecPath fails
  if (!tfzoExecPath) {
    throw new Error('Failed to get TFZO executable path');
  }

  if (options.subscribe) {
    logger.start('Subscribing for new tasks');

    const error = await subscribeToTasks(workspace, tfzoExecPath);
    if (error) {
      Logger.error('Subscription failed:', error);
      return;
    }

    logger.stop(
      `Subscribed to the API for new tasks on workspace ${workspace}`
    );
    return;
  }

  if (options.unsubscribe) {
    logger.start('Unsubscribing for new jobs');

    const error = await unsubscribeFromTasks(workspace, tfzoExecPath);
    if (error) {
      Logger.error('Unsubscription failed:', error);
      return;
    }

    logger.stop(
      `Unsubscribed to the API for new tasks on workspace ${workspace}`
    );
    return;
  }

  if (options.listen) {
    try {
      const agent = getEligibleAgent(workspace);
      if (!agent) {
        logger.outro('No agents available in the workspace');
        return;
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

      const exitCodes: number[] = [];
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
          exitCodes.push(1);
        });
      }
      logger.log(
        `${exitCodes.length}/${tasks.length} tasks have been processed`
      );
      logger.stop();
    } catch (error) {
      logger.stop('Tasks error', 1);
      throw error;
    }
  }
  // There should have been an option to listen for tasks.
  throw new Error('No option provided to listen for tasks.');
}
