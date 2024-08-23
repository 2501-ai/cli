# 2501 CLI AI Autonomous Systems Installer

This repository contains installation scripts for the AI Autonomous Systems CLI (`@2501`). The scripts are available for Linux, macOS, and Windows platforms.

## Installation Instructions

### Linux

To install the AI Autonomous Systems CLI on a Linux machine, run the following command:

```sh
curl -sL https://raw.githubusercontent.com/2501-ai/2501-cli/main/installers/linux-installer.sh | bash
```

### macOS

To install the AI Autonomous Systems CLI on a macOS machine, run the following command:

```sh
curl -sL https://raw.githubusercontent.com/2501-ai/2501-cli/main/installers/macOS-installer.sh | bash
```

### Windows

To install the AI Autonomous Systems CLI on a Windows machine, run the following command in PowerShell:

```powershell
iex "& {$(irm https://raw.githubusercontent.com/2501-ai/2501-cli/main/installers/windows-installer.bat)}"
```

## Post-Installation

After the installation is complete, you can use the `@2501` CLI to interact with AI Autonomous Systems. You may need to restart your shell to see the changes.

### Setting the API Key

Before using the CLI, set your API key with the following command:

```sh
@2501 set api-key <API_KEY>
```

### Usage

To get help on using the CLI, run:

```sh
@2501 --help
```

Example command to show the top 3 processes on the machine:

```sh
@2501 show me the top 3 process on the machine
```

For more information, refer to the documentation at [docs.2501.ai](https://docs.2501.ai).

Happy nerding! 🚀
