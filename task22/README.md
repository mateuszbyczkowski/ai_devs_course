# Generic AI Agent System

A simple, autonomous AI agent that can solve tasks with just natural language descriptions.

## Overview

This system provides a generic AI agent that can:
- Use various tools to interact with APIs, databases, and external services
- Maintain state and history across multiple iterations
- **Solve tasks autonomously with just a task description**

## Project Structure

```
task22/
├── agent/
│   ├── GenericAIAgent.ts      # Main agent class
│   └── AgentTools.ts          # Available tools for the agent
├── app.ts                     # GPS task & autonomous CLI
└── README.md                  # This file
```

## Core Components

### GenericAIAgent

The main agent class that solves tasks autonomously:

```typescript
import { GenericAIAgent } from './agent/GenericAIAgent';

const result = await GenericAIAgent.solveTask("Your task description");
```

### Available Tools

- **fetch_url**: Fetch content from URLs
- **api_request**: Make HTTP API requests
- **analyze_content**: AI-powered content analysis
- **create_plan**: Generate execution plans
- **database_query**: Execute SQL queries
- **process_data**: Transform and process data
- **submit_answer**: Submit answers to Centrala

### Prompt Templates

Pre-built prompts for common tasks:
- `analyze_logs`: Analyze system logs
- `create_execution_plan`: Create detailed plans
- `extract_entities`: Extract key information
- `classify_input`: Categorize data
- `transform_data`: Convert data formats
- `validate_data`: Validate against criteria
- `solve_problem`: General problem solving
- `decide_action`: Choose next action

## Usage Examples

### 🚀 Autonomous Task Execution

Simply describe what you want in natural language:

```bash
# Command line usage
bun run task22/app.ts "Find GPS coordinates for people in Lubawa excluding Barbara"
```

```typescript
// Programmatic usage
import { GenericAIAgent } from './agent/GenericAIAgent';

const result = await GenericAIAgent.solveTask(
  "Analyze the GPS system logs and explain what the system does"
);
```

## How It Works

The agent automatically:
- ✅ Chooses appropriate tools for the task
- ✅ Understands available API endpoints
- ✅ Manages state across multiple iterations
- ✅ Handles errors and retries
- ✅ Combines data from multiple sources

## Example Tasks

```bash
# GPS Location Task
bun run task22/app.ts "Find GPS coordinates for people in Lubawa excluding Barbara"

# Data Analysis
bun run task22/app.ts "Analyze the GPS system logs and tell me what it does"

# Database Exploration
bun run task22/app.ts "Show me all database tables and their structure"
```

## Available Tools

- **fetch_url**: Fetch content from URLs
- **api_request**: Make HTTP API requests
- **analyze_content**: AI-powered content analysis
- **create_plan**: Generate execution plans
- **database_query**: Execute SQL queries
- **process_data**: Transform and process data
- **submit_answer**: Submit answers to Centrala

## Environment Variables

Required environment variables:

```bash
PERSONAL_API_KEY=your_api_key
CENTRALA=https://c3ntrala.ag3nts.org
OPENAI_API_KEY=your_openai_key
```

## Running Tasks

```bash
# Custom task
bun run task22/app.ts "Your task description here"

# Default GPS task
bun run task22/app.ts
```

## Best Practices

1. **Be Specific**: Provide clear, detailed task descriptions
2. **Include Constraints**: Mention any exclusions or limitations
3. **State Outcomes**: Specify what format you want results in
4. **Multi-step Tasks**: The agent can handle complex workflows automatically

## Quick Start

```bash
# Try with a custom task
bun run task22/app.ts "Find GPS coordinates for people in Lubawa excluding Barbara"

# Or run the default GPS task
bun run task22/app.ts
```

## License

This is part of the AI Devs course materials.