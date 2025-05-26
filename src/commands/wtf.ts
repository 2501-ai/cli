import axios from 'axios';
import { select } from '@clack/prompts';

import { run_shell } from '../helpers/actions';

import { API_HOST, API_VERSION } from '../constants';

export async function wtfCommand() {
  const shellHistory = await run_shell({
    command: `
    shell=$(echo $SHELL)

    # Determine the history file based on the shell
    if [[ "$shell" == */bash ]]; then
      history_file=~/.bash_history
    elif [[ "$shell" == */zsh ]]; then
      history_file=~/.zsh_history
    else
      echo "Unsupported shell: $shell"
      exit 1
    fi

    # Get the last 5 commands from the history file
    if [[ -f "$history_file" ]]; then
      echo "Last 5 commands:"
      tac "$history_file" | sed 's/^: [0-9]*:[0-9]*;//' | awk '!seen[$0]++' | head -n 5
    else
      echo "History file not found: $history_file"
    fi
    `,
    shell: true,
  });

  const { data } = await axios.post(`${API_HOST}${API_VERSION}/chat`, {
    messages: [
      {
        role: 'user',
        content: `
          You're an expert in shell commands. Something went wrong with my shell history. Can you help me?
          Ignore the @2501 wtf command. It's yourself, don't mention it.

          Response with the JSON output below :
          <JSON_OUTPUT>
          {
            "potential_issues": [ // an array of potential issues from the history
              {
                "command_issue": "HERE_COMMAND_WITH_ISSUE",
                "solution": "REPLACE_WITH_SOLUTION",
                "comment": "REPLACE_WITH_COMMENT" // make it short and clear
              }
            ]
          }
          </JSON_OUTPUT>

          Shell history below :
          ${shellHistory}
        `,
      },
    ],
  });

  const JSON_REGEXP = /<JSON_OUTPUT>([\s\S]*?)<\/JSON_OUTPUT>/m;
  const match = data.response?.toString().match(JSON_REGEXP);

  try {
    const json = JSON.parse(match[1]);

    try {
      const selected = await select({
        message: 'Pick and execute a solution ↴',
        options: json.potential_issues.map((issue: any) => {
          return {
            value: issue.solution,
            label: `\x1b[31m${issue.command_issue}\x1b[0m >> \x1b[32m${issue.solution}\x1b[0m - \x1b[90m\x1b[3m${issue.comment}\x1b[0m`,
          };
        }),
      });

      console.log(' ');
      console.log(selected);

      const result = await run_shell({
        command: selected as string,
        shell: true,
      });

      console.log(result);
    } catch (e) {
      process.exit(0);
    }
  } catch (e) {
    console.log('Invalid JSON', match);
  }
}
