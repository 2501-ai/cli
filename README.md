# 2501 CLI 🤖

[![npm version](https://img.shields.io/npm/v/@2501-ai/cli.svg)](https://www.npmjs.com/package/@2501-ai/cli)
[![HumanEval Score](https://img.shields.io/badge/HumanEval-96.95%25-brightgreen.svg)](https://www.2501.ai/research/full-humaneval-benchmark)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

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

3. **Start coding faster:**

```bash
@2501 "How do I implement authentication in Express?"
```

## 🛠️ Our approach

At the heart of 2501 is an orchestration of multiple of the top-performing models on the market today. Our approach, referenced as MoM (or Mixture of Models) going forward, is designed to maximize the successful execution of coding projects derived from natural language instructions.

With no one-size-fits-all model available, output quality is highly task-dependent. Our approach is to decompose any complex software development requirements into bite-sized tasks that can then be assigned to the most suitable model for resolution.

That’s precisely why the MoM approach shines and 2501’s autonomy does not stop here. On top of that, we continually evaluate the resolution of each task with a second model to improve or fix potential hallucinations.

## 🎯 Why 2501?

- 🎯 **Unmatched Accuracy**: 96.95% success rate on HumanEval, setting a new industry standard. Check out our [benchmark](https://2501-ai.webflow.io/blog/full-humaneval-benchmark) for more details
- 🧠 **Multi-Model Intelligence**: Unlike single-model solutions, 2501 leverages multiple specialized models
- 🔍 **Context-Aware**: Understands your project structure and coding patterns
- ✅ **Self-Validating**: Eliminates hallucinations through multi-model verification
- ⚡ **Fast & Efficient** - Get answers directly in your terminal
- 🛠️ **Workspace Aware** - Understands your project context

## 💻 System Requirements

- Node.js 16.x or higher

## 🧠 How It Works

2501 uses a sophisticated Mixture of Models (MoM) approach to deliver exceptional results:

1. **Task Decomposition** - Breaks down complex requirements into manageable tasks
2. **Model Selection** - Assigns each task to the most suitable AI model
3. **Quality Assurance** - Validates solutions with a secondary model

## 📊 Comparison with Other Solutions

| Feature              | 2501   | GitHub Copilot | Other AI Assistants |
| -------------------- | ------ | -------------- | ------------------- |
| HumanEval Score      | 96.95% | ~85%           | ~80%                |
| Multi-Model Approach | ✅     | ❌             | ❌                  |
| Self-Validation      | ✅     | ❌             | ❌                  |
| Workspace Awareness  | ✅     | ✅             | ❌                  |
| Terminal Integration | ✅     | ❌             | Varies              |

## Commands

### Set Command

- Description: Set configuration values.
- Usage: `@2501 set <key> <value>`
  - `api_key`: Set the API key retrieved from the 2501 desktop app.

### Config Command

- Description: Fetches configuration data from the API.
- Usage: `@2501 config`

### Query Command

- Description: Execute a query using the specified agent.
- Usage: `@2501 query <query> [--workspace <path>] [--agentId <id>]`

### Init Command

- Description: Initializes a new agent.
- Usage: `@2501 init [--name <name>] [--workspace <path>] [--config <config_id>]`

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

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

We welcome contributions! Have questions or suggestions? Reach out to us:

- 🌐 Website: [2501.ai](https://2501.ai)
- 📧 Email: [contact@2501.ai](mailto:contact@2501.ai)
- 📚 Documentation: [docs.2501.ai](https://docs.2501.ai)
- 💬 Discord: [Join our community](https://discord.gg/2501ai)

## 🔒 Security

Found a security issue? Please email security@2501.ai
