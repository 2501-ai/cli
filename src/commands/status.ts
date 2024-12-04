import { ShellManager, ShellProcess } from '../managers/shellManager';

export async function statusCommand(options: { processId?: string }) {
  const shellManager = ShellManager.getInstance();

  if (options.processId) {
    // Show specific process status
    const status = shellManager.getStatus(options.processId);
    if (status) {
      console.table(status);
    }
  } else {
    // Show all running processes
    const processes: ShellProcess[] = shellManager.getAllProcesses();
    console.table(processes);
  }
}
