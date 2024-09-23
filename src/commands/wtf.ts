import { run_shell } from '../helpers/actions';

export async function wtfCommand() {
  console.log('WTF Command');
  const shellHistory = await run_shell({
    command: `
    # Get the current user
    current_user=$(whoami)

    # Get the last 5 commands from history
    history | tail -n 5 | awk '{$1=""; print substr($0,2)}'
    `,
    shell: true,
  });

  console.log(shellHistory);
}
