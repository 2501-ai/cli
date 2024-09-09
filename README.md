# 2501 CLI

The 2501 CLI is a command line tool designed to wrap an API, offering a convenient way for users to interact with configuration data and query information about their current workspace.

## Installation

This tool is available as an npm package. To install, run the following command:

```
npm install -g @2501-ai/cli
```

![2501.ai](https://www.2501.ai/img/2501-cli.png)

This will install the 2501 CLI globally on your system, making it available from anywhere in your terminal.

Next, set your API key retrieved from the 2501 desktop app:

```
@2501 set api_key YOUR_API_KEY
```

Now you can use the 2501 CLI commands:

```
@2501 <query>
```

Examples

```
@2501 find the location apache config in this machine
```

![2501.ai](https://www.2501.ai/img/2501-cli.gif)

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
