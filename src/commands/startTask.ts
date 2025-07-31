import Logger from '../utils/logger';
import { queryCommand } from './query';

export async function startTaskCommand(options: {
  workspace?: string;
  taskId: string;
}): Promise<number> {
  const logger = new Logger();
  logger.intro(`2501 - Starting Task ${options.taskId}`);

  // We query with the taskId to start the task.
  return await queryCommand('', options);
}
