import { OpenAIService } from "../../services/OpenAIService";
import { AgentTools, type Tool, type ToolConfig } from "./AgentTools";

export interface AgentConfig {
  objective: string;
  maxIterations?: number;
  toolConfig?: ToolConfig;
}

export interface AgentState {
  iteration: number;
  objective: string;
  data: Record<string, any>;
  history: Array<{
    action: string;
    tool?: string;
    parameters?: any;
    result?: any;
    timestamp: Date;
  }>;
  completed: boolean;
  result?: any;
}

export class GenericAIAgent {
  private openai: OpenAIService;
  private tools: AgentTools;
  private availableTools: Tool[];
  private config: AgentConfig;
  private state: AgentState;

  constructor(config: AgentConfig) {
    this.config = {
      maxIterations: 25,
      ...config,
    };

    const toolConfig: ToolConfig = {
      openaiService: new OpenAIService(),
      ...config.toolConfig,
    };

    this.openai = toolConfig.openaiService;
    this.tools = new AgentTools(toolConfig);
    this.availableTools = this.tools.getTools();

    this.state = {
      iteration: 0,
      objective: config.objective,
      data: {},
      history: [],
      completed: false,
    };
  }

  async execute(): Promise<any> {
    console.log(
      `🤖 Starting AI Agent with objective: ${this.config.objective}`,
    );

    while (
      !this.state.completed &&
      this.state.iteration < this.config.maxIterations!
    ) {
      this.state.iteration++;
      console.log(
        `\n📋 Iteration ${this.state.iteration}/${this.config.maxIterations}`,
      );

      try {
        const decision = await this.makeDecision();

        if (decision.complete) {
          this.state.completed = true;
          this.state.result = decision.result;
          console.log("✅ Objective completed:", decision.result);
          break;
        }

        if (decision.tool && decision.parameters) {
          console.log(`🤔 Reasoning: ${decision.reasoning}`);
          console.log(`🔧 Using tool: ${decision.tool}`);

          const result = await this.executeTool(
            decision.tool,
            decision.parameters,
          );
          this.updateState(decision.tool, decision.parameters, result);

          console.log(
            `✅ Tool result preview:`,
            typeof result === "object"
              ? JSON.stringify(result).substring(0, 200) + "..."
              : String(result).substring(0, 200) + "...",
          );
        }
      } catch (error) {
        console.error(`❌ Error in iteration ${this.state.iteration}:`, error);
        this.state.history.push({
          action: "error",
          result: error,
          timestamp: new Date(),
        });
      }
    }

    if (!this.state.completed) {
      console.log("⚠️ Agent stopped due to max iterations reached");
    }

    return this.state.result;
  }

  private async makeDecision(): Promise<any> {
    return await this.makeAutonomousDecision();
  }

  private async executeTool(toolName: string, parameters: any): Promise<any> {
    const tool = this.availableTools.find((t) => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }
    return await tool.execute(parameters);
  }

  private updateState(toolName: string, parameters: any, result: any): void {
    // Store result in state data
    this.state.data[`${toolName}_result`] = result;

    // Add to history
    this.state.history.push({
      action: "tool_execution",
      tool: toolName,
      parameters,
      result,
      timestamp: new Date(),
    });

    // Keep history manageable
    if (this.state.history.length > 50) {
      this.state.history = this.state.history.slice(-50);
    }
  }

  private generateProgressSummary(): string {
    const recentActions = this.state.history.slice(-5);
    const dataKeys = Object.keys(this.state.data);

    let summary = `Progress so far:\n`;
    summary += `- Completed ${this.state.iteration} iterations\n`;
    summary += `- Available data: ${dataKeys.join(", ")}\n`;

    if (recentActions.length > 0) {
      summary += `- Recent actions: ${recentActions.map((h) => h.action).join(", ")}\n`;
    }

    return summary;
  }

  /**
   * Execute a task autonomously with just a task description
   * The agent will figure out what tools to use and how to solve the task
   */
  static async solveTask(
    taskDescription: string,
    config?: Partial<AgentConfig>,
  ): Promise<any> {
    console.log("🤖 Starting Autonomous Task Execution");
    console.log("📝 Task:", taskDescription);

    const agent = new GenericAIAgent({
      objective: taskDescription,
      toolConfig: {
        baseUrl: process.env.CENTRALA,
        apiKey: process.env.PERSONAL_API_KEY,
        openaiService: new OpenAIService(),
      },
      ...config,
    });

    return await agent.execute();
  }

  /**
   * Enhanced decision making for autonomous mode
   */
  private async makeAutonomousDecision(): Promise<any> {
    const toolDescriptions = this.availableTools
      .map((tool) => `${tool.name}: ${tool.description}`)
      .join("\n");

    const progressSummary = this.generateProgressSummary();
    const recentResults = this.state.history
      .slice(-3)
      .map(
        (h) =>
          `${h.action}: ${JSON.stringify(h.result || {}).substring(0, 200)}...`,
      )
      .join("\n");

    const baseUrl = process.env.CENTRALA || "https://c3ntrala.ag3nts.org";
    const apiKey = process.env.PERSONAL_API_KEY || "";

    const prompt = `You are an autonomous AI agent solving this task: "${this.state.objective}"

Available tools:
${toolDescriptions}

IMPORTANT: Available API endpoints in this system:
- ${baseUrl}/places - Find people in a specific place. POST with: {"apikey": "${apiKey}", "query": "PLACE_NAME"}
- ${baseUrl}/people - Find places where a person was seen. POST with: {"apikey": "${apiKey}", "query": "PERSON_NAME"}
- ${baseUrl}/gps - Get GPS coordinates for a user. POST with: {"apikey": "${apiKey}", "userID": number}
- ${baseUrl}/apidb - Database queries. POST with: {"task": "database", "apikey": "${apiKey}", "query": "SQL"}

Database has tables: users, connections, correct_order, datacenters
For GPS tasks: Use /places to find people in a location, then database to get user IDs, then /gps for coordinates.

TOOL USAGE EXAMPLES:
- To use api_request: {"tool": "api_request", "parameters": {"endpoint": "${baseUrl}/places", "method": "POST", "body": {"apikey": "${apiKey}", "query": "LUBAWA"}}}
- To use database_query: {"tool": "database_query", "parameters": {"query": "SELECT id FROM users WHERE username = 'RAFAL'"}}
- To use fetch_url: {"tool": "fetch_url", "parameters": {"url": "https://example.com/data.json"}}

${progressSummary}

Recent results:
${recentResults}

Current data available:
${JSON.stringify(this.state.data, null, 2)}

Your job is to:
1. Analyze what you've accomplished so far
2. Determine the next logical step to complete the task
3. Choose the appropriate tool and parameters (MUST include full endpoint URLs for api_request)
4. If the task is complete, respond with completion status

CRITICAL: When using api_request tool, ALWAYS provide the full endpoint URL (e.g., "${baseUrl}/places") in the "endpoint" parameter.

Respond with JSON in this exact format:
{
  "reasoning": "detailed explanation of your thinking and next step",
  "tool": "tool_name",
  "parameters": { ... },
  "confidence": 0.8
}

OR if the task is complete:
{
  "complete": true,
  "result": "summary of what was accomplished and final answer",
  "confidence": 0.9
}`;

    const messages = [
      {
        role: "system" as const,
        content:
          "You are an autonomous AI agent that can use tools to solve complex tasks. Always respond with valid JSON and think step by step.",
      },
      { role: "user" as const, content: prompt },
    ];

    const response = await this.openai.completion(
      messages,
      "gpt-4o",
      false,
      false,
    );
    if ("choices" in response) {
      const content = response.choices[0].message.content;
      if (content) {
        try {
          // Clean markdown code blocks from response
          const cleanedContent = content
            .replace(/```json\s*/g, "")
            .replace(/```\s*/g, "")
            .trim();
          return JSON.parse(cleanedContent);
        } catch (e) {
          console.error("Failed to parse AI response:", content);
          throw new Error("Invalid JSON response from AI");
        }
      }
    }
    throw new Error("Failed to get AI decision");
  }
}
