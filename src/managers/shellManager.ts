import execa from 'execa';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';

import { DEFAULT_PROCESS_LOG_DIR } from '../constants';
import { readWorkspaceState, writeWorkspaceState } from '../helpers/workspace';

/**
 * The process info might be stored in the internal Map, or might be read from the system and workspace state.
 */
export interface ShellProcess {
  command: string; // The command that was executed.
  status: 'running' | 'terminated' | 'done' | 'failed';
  pid: number; // The process ID.
  output: string;
  startTime: Date;
  stdOutFile: string; // The path to the file where the stdout is stored for later retrieval.
  stdErrFile: string; // The path to the file where the stderr is stored for later retrieval.
}

/**
 * The ShellManager is a singleton that manages asynchronous child processes.
 */
export class ShellManager {
  static #instance: ShellManager;

  public static get instance() {
    if (!ShellManager.#instance) {
      ShellManager.#instance = new ShellManager();
    }
    return ShellManager.#instance;
  }

  private processes: Map<number, ShellProcess> = new Map();

  /**
   * Execute a shell command asynchronously and store the stdio to a directory.
   */
  async executeAsync(command: string): Promise<ShellProcess> {
    // Ensure the log directory exists
    if (!fs.existsSync(DEFAULT_PROCESS_LOG_DIR))
      fs.mkdirSync(DEFAULT_PROCESS_LOG_DIR, { recursive: true });

    // generate a human-readable prefix for the log files
    const prefix = command.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 10);

    // Generate a unique and sortable timestamp for the process and the log files.
    const dateFormated = new Date()
      .toISOString()
      .split('T')[0]
      .replace(/-/g, '');
    const timestamp = new Date().getTime();

    const stdOutFile = path.join(
      DEFAULT_PROCESS_LOG_DIR,
      `${dateFormated}_${timestamp}_${prefix}_stdout.log`
    );
    const stdErrFile = path.join(
      DEFAULT_PROCESS_LOG_DIR,
      `${dateFormated}_${timestamp}_${prefix}_stderr.log`
    );

    const uniqueID = randomUUID();
    const wrappedCommand = `export UNIQUE_PROCESS_ID=${uniqueID} && ${command}`;
    // Execute the command with the stdio redirected to the files.
    const childProcess = execa(wrappedCommand, {
      shell: true,
      stdio: [
        'ignore',
        fs.openSync(stdOutFile, 'w'),
        fs.openSync(stdErrFile, 'w'),
      ],
      reject: false,
    });

    const shellProcess: ShellProcess = {
      command,
      status: 'running',
      pid: -1,
      output: '',
      startTime: new Date(),
      stdErrFile,
      stdOutFile,
    };

    // Handle the process output.
    childProcess.stdout?.on('data', (data) => {
      shellProcess.output += data.toString();
    });

    childProcess.on('exit', (code) => {
      shellProcess.status = code === 0 ? 'done' : 'failed';
    });

    childProcess.unref(); // Allows the parent process to exit independently

    // Retrieve the process ID from the system since execa will only return the child process PID and not the command PID.
    // Kind of a hack, but it works.
    // TODO: Find an equivalent way to find this on Windows.
    const res = await execa(
      'ps',
      ['-o', 'pid,command', '|', 'grep', uniqueID],
      {
        shell: true,
        reject: false,
        stdout: 'pipe',
      }
    );
    const line = res.stdout
      .split('\n')
      .find((line) => line.includes(`export UNIQUE_PROCESS_ID=${uniqueID}`));
    if (!line) {
      throw new Error('Child process not found');
    }
    const processId = Number(line.split(' ')[0]);

    if (!processId) {
      throw new Error('Process ID not found');
    }
    shellProcess.pid = processId;
    // Store the process in the internal map.
    this.processes.set(processId, shellProcess);

    return shellProcess;
  }

  /**
   * Get a shell process by its ID, from the internal map or the workspace state.
   *
   * This function will also attach the stdio files changes to the internal map.**
   */
  public async getShellprocess(
    processId: string | number,
    workspace: string
  ): Promise<ShellProcess | null> {
    const pid = Number(processId);
    if (isNaN(pid)) {
      throw new Error('Invalid process ID');
    }
    const proc = this.processes.get(pid);
    // Return the process if it is found in the internal map.
    if (proc) return proc;

    // Else, try to get the process status from the system and attach it to the internal map.
    const shellProcess = this.getProcessFromWorkspace(pid, workspace);
    if (!shellProcess) {
      return null;
    }
    // Read the stdio log files.
    const stdOut = fs.readFileSync(shellProcess.stdOutFile, 'utf-8');
    const stdErr = fs.readFileSync(shellProcess.stdErrFile, 'utf-8');

    // For now, we just concatenate the stdio to the output field, since we're not able to merge the outputs
    shellProcess.output = stdOut + stdErr;

    // Check if the process is still running
    try {
      process.kill(pid, 0); // Sends a signal 0 to check if the process exists
    } catch {
      // Cleanup the log files
      fs.unlinkSync(shellProcess.stdOutFile);
      fs.unlinkSync(shellProcess.stdErrFile);

      shellProcess.status = 'terminated';
      this.removeProcessFromWorkspace(pid, workspace);
      return shellProcess;
    }

    shellProcess.status = 'running';

    // Watch the files for changes
    const watcher = fs.watchFile(shellProcess.stdOutFile, () => {
      shellProcess.output += fs.readFileSync(shellProcess.stdOutFile, 'utf-8');
    });
    // Unref the watcher so it doesn't keep the event loop active and prevent the parent process from exiting.
    watcher.unref();

    return shellProcess;
  }
  getAllProcesses() {
    return Array.from(this.processes.values());
    // TODO: concat with processes from workspace state
  }

  /**
   * Save a process to the workspace state.
   */
  addProcessToWorkspace(processInfo: ShellProcess, workspace: string) {
    // Store the running process in the workspace state.
    const state = readWorkspaceState(workspace);
    if (state.running_processes) {
      state.running_processes.push(processInfo);
    } else {
      state.running_processes = [processInfo];
    }
    writeWorkspaceState(state);
  }

  /**
   * Remove a process from the workspace state.
   */
  removeProcessFromWorkspace(processId: number, workspace: string) {
    const state = readWorkspaceState(workspace);
    if (state.running_processes) {
      state.running_processes = state.running_processes.filter(
        (proc: ShellProcess) => proc.pid !== processId
      );
    }
    writeWorkspaceState(state);
  }

  /**
   * Get a process from the stored workspace state.
   */
  getProcessFromWorkspace(
    processId: number,
    workspace: string
  ): ShellProcess | null {
    const state = readWorkspaceState(workspace);
    const shellProcess = state.running_processes?.find(
      (proc: ShellProcess) => proc.pid === processId
    );

    return shellProcess ?? null;
  }
}
