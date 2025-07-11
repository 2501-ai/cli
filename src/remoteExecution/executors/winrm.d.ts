declare module 'nodejs-winrm' {
  interface WinRMParams {
    host: string;
    port?: number;
    path?: string;
    auth?: string;
    shellId?: string;
    command?: string;
    commandId?: string;
  }

  interface Shell {
    doCreateShell(params: WinRMParams): Promise<string>;
    doDeleteShell(params: WinRMParams): Promise<void>;
  }

  interface Command {
    doExecuteCommand(params: WinRMParams): Promise<string>;
    doExecutePowershell(params: WinRMParams): Promise<string>;
    doReceiveOutput(params: WinRMParams): Promise<string>;
  }

  export function runCommand(
    command: string,
    host: string,
    username: string,
    password: string,
    port?: number,
    usePowershell?: boolean
  ): Promise<string>;

  export function runPowershell(
    command: string,
    host: string,
    username: string,
    password: string,
    port?: number
  ): Promise<string>;

  export const shell: Shell;
  export const command: Command;
}
