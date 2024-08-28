import { Manager } from '@listr2/manager';
import type { ListrBaseClassOptions, ListrTask } from 'listr2';

export function TaskManagerFactory<T = TaskManager>(
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
  static #manager: Manager<Ctx>;
  static #isRunning = false;

  static get manager() {
    if (!this.#manager) {
      this.#manager = TaskManagerFactory<Ctx>();
    }
    return this.#manager;
  }

  public static addTask(tasks: ListrTask[], options?: ListrBaseClassOptions) {
    this.manager.add(tasks, options);
  }

  public static indentTask(
    tasks: ListrTask[],
    options?: ListrBaseClassOptions
  ) {
    this.manager.indent(tasks, options);
  }

  static run<Ctx = any>(
    taskList: ListrTask<Ctx>[],
    options?: ListrBaseClassOptions<Ctx>
  ) {
    return this.manager.run(taskList, options);
  }

  static runAll() {
    return this.manager.runAll();
  }
}
