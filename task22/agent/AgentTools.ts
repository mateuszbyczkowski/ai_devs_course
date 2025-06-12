import { OpenAIService } from "../../services/OpenAIService";
import { sendAnswerToCentrala } from "../../services/CentralaAPIService";

export interface Tool {
  name: string;
  description: string;
  parameters: any;
  execute: (params: any) => Promise<any>;
}

export interface ToolConfig {
  openaiService: OpenAIService;
  baseUrl?: string;
  apiKey?: string;
}

export class AgentTools {
  private openai: OpenAIService;
  private baseUrl: string;
  private apiKey: string;

  constructor(config: ToolConfig) {
    this.openai = config.openaiService;
    this.baseUrl = config.baseUrl || process.env.CENTRALA || "";
    this.apiKey = config.apiKey || process.env.PERSONAL_API_KEY || "";
  }

  getTools(): Tool[] {
    return [
      this.createFetchUrlTool(),
      this.createApiRequestTool(),
      this.createAnalyzeContentTool(),
      this.createCreatePlanTool(),
      this.createSubmitAnswerTool(),
      this.createDatabaseQueryTool(),
      this.createProcessDataTool(),
    ];
  }

  private createFetchUrlTool(): Tool {
    return {
      name: "fetch_url",
      description: "Fetch content from a URL",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to fetch" },
        },
        required: ["url"],
      },
      execute: async (params: { url: string }) => {
        try {
          const response = await fetch(params.url);
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const contentType = response.headers.get("content-type");
          if (contentType?.includes("application/json")) {
            return await response.json();
          }
          return await response.text();
        } catch (error) {
          throw new Error(`Failed to fetch ${params.url}: ${error}`);
        }
      },
    };
  }

  private createApiRequestTool(): Tool {
    return {
      name: "api_request",
      description: "Make an API request",
      parameters: {
        type: "object",
        properties: {
          endpoint: { type: "string", description: "API endpoint" },
          method: {
            type: "string",
            description: "HTTP method",
            default: "POST",
          },
          body: { type: "object", description: "Request body" },
          headers: { type: "object", description: "Additional headers" },
        },
        required: ["endpoint"],
      },
      execute: async (params: {
        endpoint: string;
        method?: string;
        body?: any;
        headers?: any;
      }) => {
        try {
          const options: RequestInit = {
            method: params.method || "POST",
            headers: {
              "Content-Type": "application/json",
              ...params.headers,
            },
          };

          if (params.body) {
            options.body = JSON.stringify(params.body);
          }

          const response = await fetch(params.endpoint, options);
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
              `HTTP error! status: ${response.status}, body: ${errorText}`,
            );
          }

          const contentType = response.headers.get("content-type");
          if (contentType?.includes("application/json")) {
            return await response.json();
          }
          return await response.text();
        } catch (error) {
          throw new Error(`API request failed: ${error}`);
        }
      },
    };
  }

  private createAnalyzeContentTool(): Tool {
    return {
      name: "analyze_content",
      description:
        "Analyze content using AI to understand patterns and extract insights",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "Content to analyze" },
          analysisType: {
            type: "string",
            description: "Type of analysis to perform",
          },
          context: {
            type: "string",
            description: "Additional context for analysis",
          },
        },
        required: ["content", "analysisType"],
      },
      execute: async (params: {
        content: string;
        analysisType: string;
        context?: string;
      }) => {
        const prompt = `Analyze the following content for: ${params.analysisType}

${params.context ? `Context: ${params.context}` : ""}

Content:
${params.content}

Provide a detailed analysis explaining:
1. What patterns or structures you identify
2. What the main purpose or function appears to be
3. What key insights can be extracted
4. How this information could be used or replicated`;

        const messages = [
          {
            role: "system" as const,
            content:
              "You are an expert analyst capable of understanding complex systems and patterns.",
          },
          { role: "user" as const, content: prompt },
        ];

        const response = await this.openai.completion(messages);
        if ("choices" in response) {
          return response.choices[0].message.content;
        }
        throw new Error("Failed to analyze content");
      },
    };
  }

  private createCreatePlanTool(): Tool {
    return {
      name: "create_plan",
      description: "Create an execution plan based on analysis and objectives",
      parameters: {
        type: "object",
        properties: {
          objective: {
            type: "string",
            description: "Main objective to achieve",
          },
          analysis: {
            type: "string",
            description: "Analysis of available information",
          },
          constraints: {
            type: "array",
            description: "Any constraints or limitations",
          },
          availableTools: {
            type: "array",
            description: "Available tools and resources",
          },
        },
        required: ["objective", "analysis"],
      },
      execute: async (params: {
        objective: string;
        analysis: string;
        constraints?: string[];
        availableTools?: string[];
      }) => {
        const prompt = `Create a detailed execution plan for the following objective:

Objective: ${params.objective}

Analysis: ${params.analysis}

${params.constraints ? `Constraints: ${params.constraints.join(", ")}` : ""}
${params.availableTools ? `Available tools: ${params.availableTools.join(", ")}` : ""}

Create a step-by-step plan that:
1. Breaks down the objective into manageable steps
2. Considers the analysis and constraints
3. Utilizes available tools effectively
4. Includes error handling and fallback strategies
5. Provides specific actions for each step`;

        const messages = [
          {
            role: "system" as const,
            content:
              "You are an expert planning specialist who creates detailed, actionable execution plans.",
          },
          { role: "user" as const, content: prompt },
        ];

        const response = await this.openai.completion(messages);
        if ("choices" in response) {
          const content = response.choices[0].message.content;
          return content
            ?.split("\n")
            .filter((line) => line.trim())
            .map((line) => line.trim());
        }
        throw new Error("Failed to create plan");
      },
    };
  }

  private createSubmitAnswerTool(): Tool {
    return {
      name: "submit_answer",
      description: "Submit the final answer to Centrala",
      parameters: {
        type: "object",
        properties: {
          answer: { type: "object", description: "Answer to submit" },
          task: { type: "string", description: "Task name" },
        },
        required: ["answer", "task"],
      },
      execute: async (params: { answer: any; task: string }) => {
        return await sendAnswerToCentrala(params.answer, params.task);
      },
    };
  }

  private createDatabaseQueryTool(): Tool {
    return {
      name: "database_query",
      description: "Execute a database query using the apidb endpoint",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "SQL query to execute" },
          endpoint: {
            type: "string",
            description: "Database endpoint",
            default: "/apidb",
          },
        },
        required: ["query"],
      },
      execute: async (params: { query: string; endpoint?: string }) => {
        const endpoint = `${this.baseUrl}${params.endpoint || "/apidb"}`;

        const options: RequestInit = {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            task: "database",
            apikey: this.apiKey,
            query: params.query,
          }),
        };

        const response = await fetch(endpoint, options);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Database query failed! status: ${response.status}, body: ${errorText}`,
          );
        }

        return await response.json();
      },
    };
  }

  private createProcessDataTool(): Tool {
    return {
      name: "process_data",
      description: "Process and transform data using AI",
      parameters: {
        type: "object",
        properties: {
          data: { type: "object", description: "Data to process" },
          operation: {
            type: "string",
            description: "Operation to perform on the data",
          },
          format: { type: "string", description: "Desired output format" },
        },
        required: ["data", "operation"],
      },
      execute: async (params: {
        data: any;
        operation: string;
        format?: string;
      }) => {
        const prompt = `Process the following data by performing this operation: ${params.operation}

Data: ${JSON.stringify(params.data, null, 2)}

${params.format ? `Output format: ${params.format}` : "Return the processed data in a clear, structured format."}

Perform the requested operation and return the result.`;

        const messages = [
          {
            role: "system" as const,
            content:
              "You are a data processing expert. Process data according to instructions and return structured results.",
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
              return JSON.parse(content);
            } catch {
              return content;
            }
          }
        }
        throw new Error("Failed to process data");
      },
    };
  }
}
