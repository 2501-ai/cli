# 2501 CLI

Welcome in 2501 Command Line ! Use 2501's autonomous agents in your shell to get instant answers to your coding questions,
take action on your machine(s), and more !

![2501.ai](https://cdn.prod.website-files.com/66d85488f50fa8bc7faa2cfd/66eabbe4bb94bd481b3d44b0_cli%20use%20case.gif)

### Our approach

At the heart of 2501 is an orchestration of multiple of the top-performing models on the market today. Our approach, referenced as MoM (or Mixture of Models) going forward, is designed to maximize the successful execution of coding projects derived from natural language instructions.

With no one-size-fits-all model available, output quality is highly task-dependent. Our approach is to decompose any complex software development requirements into bite-sized tasks that can then be assigned to the most suitable model for resolution.

That’s precisely why the MoM approach shines and 2501’s autonomy does not stop here. On top of that, we continually evaluate the resolution of each task with a second model to improve or fix potential hallucinations.

### Performance

2501’s performance on the full HumanEval, has scored 96.951 after the most recent core updates.
Check out our [benchmark](https://2501-ai.webflow.io/blog/full-humaneval-benchmark) for more details.

## Installation

This tool is available as an npm package. To install, run the following command:

```
npm install -g @2501-ai/cli
```

![2501.ai](https://cdn.prod.website-files.com/66d85488f50fa8bc7faa2cfd/66eaa71b01bd176d8e1de4d1_cli%20install.png)

This will install the 2501 CLI globally on your system, making it available from anywhere in your terminal.

Next, set your API key retrieved from the 2501 accounts.

If you're not yet a 2501 user, register here and get your API key : https://accounts.2501.ai/pay

```
@2501 set api_key YOUR_API_KEY
```

Now you can use the 2501 CLI commands:

```
@2501 <query>
```

## Commands

### Set Command

- Command: `set`
- Description: Set configuration values.
- Usage: `@2501 set <key> <value>`

  - `api_key`: Set the API key retrieved from the 2501 desktop app.

### Config Command

- Command: `config`
- Description: Fetches configuration data from the API.
- Usage: `@2501 config`

### Query Command

- Command: `query`
- Description: Execute a query using the specified agent.
- Usage: `@2501 query <query> [--workspace <path>] [--agentId <id>]`

### Init Command

- Command: `init`
- Description: Initializes a new agent.
- Usage: `@2501 init [--name <name>] [--workspace <path>] [--config <config_id>]`

### Agents Command

- Command: `agents`
- Description: List agents in the current workspace or all agents on the machine.
- Usage: `@2501 agents [--workspace <path>] [--all] [--flush]`

### Jobs Command

- Command: `jobs`
- Description: Fetch jobs from API.
- Usage: `@2501 jobs [--workspace <path>] [--subscribe] [--listen]`

  - `--workspace <path>`: Specify a different workspace path.
  - `--subscribe`: Subscribe every minute to the API for new jobs on the current workspace.
  - `--unsubscribe`: Unsubscribe the current workspace for new jobs.
  - `--listen`: Listen for new jobs from the API and execute them.

## Contributing

Contributions to this project are welcome. For any questions or requests, please visit our website [2501.ai](https://2501.ai) or contact us at [contact@2501.ai](mailto:contact@2501.ai).
