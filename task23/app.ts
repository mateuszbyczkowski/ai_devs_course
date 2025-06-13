import { OpenAIService } from "../services/OpenAIService.js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

interface TaskResponse {
  data: any;
  task: string;
}

interface ApiResponse {
  timestamp: number;
  signature: string;
  challenges: string[];
}

class Task23Agent {
  private openAI: OpenAIService;
  private apiKey: string;
  private logs: string[] = [];
  private baseUrl: string;
  private password: string;

  constructor() {
    this.openAI = new OpenAIService();
    this.apiKey = process.env.PERSONAL_API_KEY!;
    this.baseUrl = process.env.RAFAL_API_URL!;
    this.password = process.env.RAFAL_PASSWORD!;
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    this.logs.push(logEntry);
    console.log(logEntry);
  }

  private async saveLogs(): Promise<void> {
    const logsPath = path.join(__dirname, "logs.txt");
    const logsContent = this.logs.join("\n");
    fs.writeFileSync(logsPath, logsContent, "utf8");
    this.log("Logs saved to logs.txt");
  }

  private async makeRequest(url: string, data: any): Promise<any> {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseText = await response.text();
      this.log(`Raw response from ${url}: ${responseText}`);

      try {
        const result = JSON.parse(responseText);
        this.log(`Parsed JSON response from ${url}: ${JSON.stringify(result)}`);
        return result;
      } catch (jsonError) {
        // If it's not JSON, check if it's HTML error page
        if (
          responseText.includes("<!doctype html>") ||
          responseText.includes("<html>")
        ) {
          this.log(`Received HTML page instead of JSON from ${url}`);
          throw new Error(
            `API endpoint ${url} returned HTML page instead of JSON`,
          );
        }
        this.log(`Response is not JSON, returning as text: ${responseText}`);
        return { text: responseText };
      }
    } catch (error) {
      this.log(`Error making request to ${url}: ${error}`);
      throw error;
    }
  }

  private async getHash(): Promise<string> {
    this.log("Step 1: Sending password to get HASH");
    const response = await this.makeRequest(this.baseUrl, {
      password: this.password,
    });

    // Handle both JSON and text responses
    let hash: string;
    if (response.message) {
      hash = response.message;
    } else {
      throw new Error("No hash received from password request");
    }

    this.log(`Received HASH: ${hash}`);
    return hash;
  }

  private async getUrls(hash: string): Promise<ApiResponse> {
    this.log("Step 2: Sending HASH to get URLs");
    const response = await this.makeRequest(this.baseUrl, {
      sign: hash,
    });

    // Handle response structure with message containing the actual data
    let apiData: ApiResponse;
    if (response.message && response.message.challenges) {
      apiData = response.message;
      this.log(
        `Received URLs - challenges: ${JSON.stringify(apiData.challenges)}`,
      );
      return apiData;
    } else if (response.challenges) {
      this.log(
        `Received URLs - challenges: ${JSON.stringify(response.challenges)}`,
      );
      return response;
    } else if (response.text) {
      // Try to parse text response if it contains the data
      try {
        const parsed = JSON.parse(response.text);
        if (parsed.message && parsed.message.challenges) {
          this.log(
            `Received URLs - challenges: ${JSON.stringify(parsed.message.challenges)}`,
          );
          return parsed.message;
        }
      } catch (e) {
        // Not JSON text
      }
      throw new Error(`Unexpected text response: ${response.text}`);
    } else {
      throw new Error("No source URLs received from sign request");
    }
  }

  private async fetchTaskData(url: string): Promise<TaskResponse> {
    this.log(`Fetching data from: ${url}`);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      this.log(`Data from ${url}: ${JSON.stringify(data)}`);
      return data;
    } catch (error) {
      this.log(`Error fetching from ${url}: ${error}`);
      throw error;
    }
  }

  private async processTaskWithLLM(data: any, task: string): Promise<string> {
    this.log(`Processing task: ${task}`);

    // Check if task requires external document
    let context = "";
    const urlMatch = task.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      const externalUrl = urlMatch[0];
      this.log(`Fetching external document for context from: ${externalUrl}`);
      try {
        const response = await fetch(externalUrl);
        if (response.ok) {
          context = await response.text();
          this.log("External document fetched successfully");
        }
      } catch (error) {
        this.log(`Error fetching external document: ${error}`);
      }
    }

    const messages = [
      {
        role: "system" as const,
        content:
          "You are a helpful assistant. Answer each question with ONLY the direct answer - do not repeat the question or add explanatory text. Be concise and accurate. Format as numbered list if multiple questions.",
      },
      {
        role: "user" as const,
        content: `Data: ${JSON.stringify(data)}\n\nTask: ${task}\n\n${context ? `Context from document:\n${context}\n\n` : ""}Provide only the direct answers, one per line if multiple questions.`,
      },
    ];

    try {
      const response = await this.openAI.completion(
        messages,
        "gpt-4o",
        false,
        false,
      );

      if ("choices" in response && response.choices[0]?.message?.content) {
        const answer = response.choices[0].message.content.trim();
        this.log(`LLM response for task "${task}": ${answer}`);
        return answer;
      }

      throw new Error("No valid response from LLM");
    } catch (error) {
      this.log(`Error processing task with LLM: ${error}`);
      throw error;
    }
  }

  async solve(): Promise<void> {
    const startTime = Date.now();
    this.log("Starting Task23 - Time limit: 6 seconds");

    try {
      // Step 1: Get HASH
      const hash = await this.getHash();

      // Step 2: Get URLs
      const apiResponse = await this.getUrls(hash);

      // Step 3: Fetch data from both sources in parallel
      this.log("Step 3: Fetching data from both sources in parallel");
      const [taskData0, taskData1] = await Promise.all([
        this.fetchTaskData(apiResponse.challenges[0]),
        this.fetchTaskData(apiResponse.challenges[1]),
      ]);

      // Step 4: Process both tasks with LLM in parallel
      this.log("Step 4: Processing both tasks with LLM in parallel");
      const [answer0, answer1] = await Promise.all([
        this.processTaskWithLLM(taskData0.data, taskData0.task),
        this.processTaskWithLLM(taskData1.data, taskData1.task),
      ]);

      // Step 5: Create ordered list of all questions and their answers
      const allQuestions = [...taskData0.data, ...taskData1.data];
      const allAnswers = [];

      // Parse source0 answers (should be 4 answers)
      const source0Lines = answer0.split("\n").filter((line) => line.trim());
      let source0Answers = [];
      if (source0Lines.some((line) => line.match(/^\d+\./))) {
        // Numbered format
        source0Answers = source0Lines
          .filter((line) => line.match(/^\d+\./))
          .map((line) => line.replace(/^\d+\.\s*/, "").trim());
      } else {
        // Simple line format
        source0Answers = source0Lines.slice(0, 4);
      }

      // Parse source1 answers - extract answers from numbered format
      const source1Lines = answer1.split("\n").filter((line) => line.trim());
      let source1Answers = [];
      if (source1Lines.some((line) => line.match(/^\d+\./))) {
        // Numbered format
        source1Answers = source1Lines
          .filter((line) => line.match(/^\d+\./))
          .map((line) => line.replace(/^\d+\.\s*/, "").trim());
      } else {
        // Simple format - split by lines
        source1Answers = source1Lines.slice(0, 2);
      }

      // Combine answers in the order they were received
      allAnswers.push(...source0Answers, ...source1Answers);

      // Combine all answers into single response for Rafal API
      const mergedAnswer = allAnswers.join(" ");

      this.log(`Questions: ${JSON.stringify(allQuestions)}`);
      this.log(`Answers: ${JSON.stringify(allAnswers)}`);
      this.log(`Final answer: ${mergedAnswer}`);

      // Step 6: Submit back to Rafal API
      this.log("Step 5: Submitting answer back to Rafal API");
      const finalPayload = {
        apikey: this.apiKey,
        timestamp: apiResponse.timestamp,
        signature: apiResponse.signature,
        answer: mergedAnswer,
      };

      this.log(`Final payload: ${JSON.stringify(finalPayload)}`);

      const result = await this.makeRequest(this.baseUrl, finalPayload);
      this.log(`Final result: ${JSON.stringify(result)}`);

      const endTime = Date.now();
      const totalTime = (endTime - startTime) / 1000;

      this.log(`Task completed in ${totalTime} seconds`);
      this.log(`Centrala response: ${JSON.stringify(result)}`);

      // Display flag and note if present
      if (result.message) {
        console.log("\n🚩 RESULT:");
        console.log(result.message);
      }

      if (result.flag) {
        console.log("\n🚩 FLAG:");
        console.log(result.flag);
      }

      // Save logs
      await this.saveLogs();
    } catch (error) {
      const endTime = Date.now();
      const totalTime = (endTime - startTime) / 1000;

      this.log(`Task failed after ${totalTime} seconds: ${error}`);
      await this.saveLogs();
      throw error;
    }
  }
}

// Execute the task
const agent = new Task23Agent();
await agent.solve();
