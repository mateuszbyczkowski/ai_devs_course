import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import axios from "axios";
import { OpenAIService } from "../services/OpenAIService";
import { fetchAndProcessArticle } from "./articleProcessor.js";
import { fetchQuestions } from "./questionFetcher.js";
import { answerQuestions } from "./questionAnswerer.js";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

/**
 * Main execution function
 */
async function main() {
  try {
    console.log("Starting ArXiv task...");
    const openAIService = new OpenAIService();
    const outputDir = path.join(__dirname, "output");

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Step 1: Fetch and process the article
    console.log("Fetching and processing article...");
    const articleUrl = `${process.env.CENTRALA}/dane/arxiv-draft.html`;
    const indexedContent = await fetchAndProcessArticle(
      articleUrl,
      outputDir,
      openAIService,
    );

    // Step 2: Fetch questions
    console.log("Fetching questions...");
    const apiKey = process.env.PERSONAL_API_KEY;
    if (!apiKey) {
      throw new Error(
        "PERSONAL_API_KEY is not defined in environment variables",
      );
    }
    const questions = await fetchQuestions(apiKey);

    // Step 3: Answer questions using the indexed content as context
    console.log("Answering questions...");
    const answers = await answerQuestions(
      questions,
      indexedContent,
      openAIService,
    );

    // Debug: Log just the answers data
    console.log("Answers to be submitted:", JSON.stringify(answers, null, 2));

    // Step 4: Submit answers
    console.log("Submitting answers...");
    try {
      const response = await submitAnswers(answers);

      console.log("API response data:", response);
      return { indexedContent, questions, answers, response };
    } catch (error: any) {
      console.error("Error submitting answers:", error.message);
      if (error.response) {
        console.error("Response data:", error.response.data);
        console.error("Response status:", error.response.status);
      }
      throw error;
    }
  } catch (error) {
    console.error("Error in main process:", error);
    throw error;
  }
}

/**
 * Submits answers to the API
 */
async function submitAnswers(answers: Record<string, string>): Promise<any> {
  const payload = {
    task: "arxiv",
    apikey: process.env.PERSONAL_API_KEY,
    answer: answers,
  };

  console.log(
    "Payload data to be sent:",
    JSON.stringify(payload.answer, null, 2),
  );

  try {
    const response = await axios.post(
      `${process.env.CENTRALA}/report`,
      payload,
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      },
    );
    return response.data;
  } catch (error: any) {
    console.error("Error submitting answers:", error.message);
    if (error.response && error.response.data) {
      console.error("Response data:", error.response.data);
    }
    throw new Error();
  }
}

// Run the main function if this module is executed directly
if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

// Export the main function for potential use in other modules
export { main };
