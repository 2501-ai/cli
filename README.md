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
- Description: Initializes a new workspace by creating the necessary files and directories.
- Usage: `2501 init [--name <name>] [--path <path>]`

The `--name` option allows specifying a name for the new workspace. The `--path` option sets the path where the workspace should be created. If no path is provided, the workspace will be created in the current working directory.

### Build Command

- Command: `build`
- Description: Builds the project by compiling source files and generating output artifacts.
- Usage: `2501 build [--watch]`

The `--watch` option enables watch mode, which will automatically rebuild the project whenever source files are modified.

## Development

After making changes to the source code, you can build the project using `npm run build`. To run the CLI tool, use `node .` or `npm start` from the project directory.

## Contributing

Contributions to this project are welcome. Please refer to the [GitHub issue tracker](https://github.com/tj/commander.js/issues/756) for discussions and features related to this CLI tool.