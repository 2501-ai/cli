# 2501 CLI

The 2501 CLI is a command line tool designed to wrap an API, offering a convenient way for users to interact with configuration data and query information about their current workspace.

## Installation

This tool is available as an npm package. To install, run the following command:

```
npm install -g @2501/2501-cli
```

This will install the 2501 CLI globally on your system, making it available from anywhere in your terminal.

## Commands

### Config Command

- Command: `config`
- Description: Fetches configuration data from the API.
- Usage: `2501 config`

### Query Command

- Command: `query`
- Description: Displays information about the current workspace and allows specifying a different workspace path.
- Usage: `2501 query [--workspace <path>]`

Specify a different workspace path using the `--workspace` option if needed. The default workspace is the current working directory of the process.

### Init Command

- Command: `init`
- Description: Initializes a new agent.
- Usage: `2501 init [--name <name>] [--workspace <path>] [--config <config_id>]`

## Contributing

Contributions to this project are welcome. Please refer to the [GitHub issue tracker](https://github.com/tj/commander.js/issues/756) for discussions and features related to this CLI tool.