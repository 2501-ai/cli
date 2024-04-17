import { Manager } from '@listr2/manager';
import type { ListrBaseClassOptions } from 'listr2';
import { delay, ListrLogger, ListrLogLevels } from 'listr2';

function TaskManagerFactory<T = any>(
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

export class TaskManager {
  private tasks = TaskManagerFactory<Ctx>();
  private logger = new ListrLogger({ useIcons: false });

  public async addTask(
    title: string,
    task: () => Promise<void>
  ): Promise<void> {
    this.tasks.add([{ title, task }]);
  }

  public async run(title: string, task: () => Promise<void>): Promise<void> {
    await this.tasks.run([
      {
        title,
        task,
      },
    ]);
  }

  public async runAllTasks(): Promise<void> {
    await this.tasks.runAll();
  }
}
