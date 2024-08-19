import { Manager } from '@listr2/manager';
import type { ListrBaseClassOptions } from 'listr2';
import { ListrLogger } from 'listr2';
import { Logger } from './logger';

function TaskManagerFactory<T = TaskManager>(
  override?: ListrBaseClassOptions
): Manager<T> {
  return new Manager({
    concurrent: false,
    exitOnError: false,
    rendererOptions: {
      collapseSubtasks: false,
      collapseSkips: false,
    },
    ...override,
  });
}

interface Ctx {
  injected?: boolean;
  runTime?: number;
}

type Task = () => Promise<void>;

export class TaskManager {
  private tasks = TaskManagerFactory<Ctx>();
  private logger = new ListrLogger({ useIcons: false });

  public async addTask(
    title: string,
    task: () => Promise<void>
  ): Promise<void> {
    this.tasks.add([{ title, task }]);
  }

  public async run(title: string, task: Task): Promise<void> {
    await this.tasks
      .run([
        {
          title,
          task,
        },
      ])
      .catch((e) => {
        Logger.error('TaskManager run error', e);
      });
  }

  public async runAllTasks(): Promise<void> {
    await this.tasks.runAll();
  }
}
