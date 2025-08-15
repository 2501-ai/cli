# 2501 CLI 🤖

[![npm version](https://img.shields.io/npm/v/@2501-ai/cli.svg)](https://www.npmjs.com/package/@2501-ai/cli)
[![HumanEval Score](https://img.shields.io/badge/HumanEval-96.95%25-brightgreen.svg)](https://www.2501.ai/research/full-humaneval-benchmark)
[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)
[![Discord](https://img.shields.io/badge/chat-on%20discord-7289DA.svg)](https://discord.gg/DYC8ryeC7e)

Your AI-powered autonomous agent that codes, interacts with your infrastructure and development workflows.

Whether you're debugging production issues, automating DevOps tasks, or seeking coding assistance, 2501 CLI brings the power of multiple specialized autonomous agents directly to your terminal.

![2501.ai](https://2501-cli.s3.us-east-1.amazonaws.com/demo-2501-accelerated-1.gif)

## 🚀 Getting Started

1. **Install the CLI:**

```bash
npm install -g @2501-ai/cli
```

2. **Set up your API key:**

- Get your API key at [accounts.2501.ai](https://accounts.2501.ai)
- Configure the CLI:

```bash
@2501 set api_key YOUR_API_KEY
```

3. **Supercharge your terminal:**

```bash
@2501 Implement authentication in my express app
```

## 🤔 Why 2501?

- 🎯 **Unmatched Accuracy**: 96.95% success rate on HumanEval, setting a new industry standard. Check out our [benchmark](https://2501-ai.webflow.io/blog/full-humaneval-benchmark) for more details
- 🧠 **Multi-Model Intelligence**: Unlike single-model solutions, 2501 leverages multiple specialized models
- 🔍 **Context-Aware**: Understands your project structure and coding patterns
- ✅ **Self-Validating**: Eliminates hallucinations through multi-model verification
- ⚡ **Fast & Efficient** - Get answers directly in your terminal
- 🛠️ **Workspace Aware** - Understands your project context

## 🧠 How It Works

At the heart of 2501 is an orchestration of multiple of the top-performing models on the market today. Our approach, referenced as MoM (or Mixture of Models) going forward, is designed to maximize the successful execution of coding projects derived from natural language instructions.

With no one-size-fits-all model available, output quality is highly task-dependent. Our approach is to decompose any complex software development requirements into bite-sized tasks that can then be assigned to the most suitable model for resolution.

That’s precisely why the MoM approach shines and 2501’s autonomy does not stop here. On top of that, we continually evaluate the resolution of each task with a second model to improve or fix potential hallucinations.

## 📊 Comparison with Other Solutions

| Feature              | 2501   | GitHub Copilot                                    | Other AI Assistants                                       |
| -------------------- | ------ | ------------------------------------------------- | --------------------------------------------------------- |
| HumanEval Score      | 96.95% | [~48.1%](https://cdn.openai.com/papers/gpt-4.pdf) | [~90%](https://artificialanalysis.ai/leaderboards/models) |
| Multi-Model Approach | ✅     | ❌                                                | ❌                                                        |
| Self-Validation      | ✅     | ❌                                                | ❌                                                        |
| Workspace Awareness  | ✅     | ✅                                                | Varies                                                    |
| Terminal Integration | ✅     | ❌                                                | Varies                                                    |

## 💻 System Requirements

- Node.js 16.x or higher

## Commands

### Set Command

- Description: Set configuration values.
- Usage: `@2501 set <key> <value>`
  - `api_key`: Set the API key retrieved from the 2501 desktop app.

### Config Command

- Description: Fetches available agentic configurations from the API.
- Usage: `@2501 config`

### Query Command

- Description: Execute a query using the specified agent.
- Common usage: `@2501 Implement authentication in my express app`
  - This will execute the query using the agent assigned to the current workspace.
- Custom Usage: `@2501 <query> [--workspace <path>] [--agentId <id>]`

### Init Command

- Description: Initializes a new agent.
- Usage: `@2501 init [--name <name>] [--workspace <path>] [--config <configKey>]`

### Agents Command

- Description: List agents in the current workspace or all agents on the machine.
- Usage: `@2501 agents [--workspace <path>] [--all] [--flush]`

### Jobs Command

- Description: Fetch jobs from API.
- Usage: `@2501 jobs [--workspace <path>] [--subscribe] [--listen]`
  - `--workspace <path>`: Specify a different workspace path.
  - `--subscribe`: Subscribe every minute to the API for new jobs on the current workspace.
  - `--unsubscribe`: Unsubscribe the current workspace for new jobs.
  - `--listen`: Listen for new jobs from the API and execute them.

### Remote Execution

Execute commands on remote servers using the `--remote-exec` option. Supports multiple authentication methods:

#### SSH Authentication Methods

```bash
# Basic connection
@2501 init --remote-exec user@server.com:22

# With private key authentication (works with PEM or RSA keys (default ~/.ssh/id_rsa))
@2501 init --remote-exec user@server.com:22 --remote-private-key $(cat ./some.pem)

# With password authentication
@2501 init --remote-exec user@server.com:22 --remote-exec-password yourpassword

# Specify connection type (ssh is default)
@2501 init --remote-exec user@server.com:22 --remote-exec-type ssh
```

#### WinRM Authentication (Windows)

```bash
# WinRM connection with password
@2501 init --remote-exec user@windows-server.com:5985 --remote-exec-type winrm --remote-exec-password yourpassword
```

#### Options

- `--remote-exec <connection>`: Enable remote execution (user@host:port)
- `--remote-private-key <privateKey>`: Path to private key for remote execution
- `--remote-exec-type <type>`: Type of remote execution: ssh or winrm (defaults to ssh)
- `--remote-exec-password <password>`: Password for remote execution

## 🤝 Contributing

We welcome contributions! Have questions or suggestions? Reach out to us:

- 🌐 Website: [2501.ai](https://2501.ai)
- 📧 Email: [contact@2501.ai](mailto:contact@2501.ai)
- 📚 Documentation: [docs.2501.ai](https://docs.2501.ai)
- 💬 Discord: [Join our community](https://discord.gg/DYC8ryeC7e)

## 🔒 Security

Found a security issue? Please email security@2501.ai

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.
