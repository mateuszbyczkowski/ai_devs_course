import * as fs from "fs";
import * as path from "path";
import { OpenAIService } from "../services/OpenAIService";
import { sendAnswerToCentrala } from "../services/CentralaAPIService";
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
} from "openai/resources/index.mjs";

// File path for verification data
const verifyFilePath = path.join(__dirname, "lab_data", "verify.txt");
const MODEL_NAME = process.env.FINETUNE_MODEL || "ft:gpt-4.1-mini-2024-07-26"; // Replace with actual model name

async function verifyData() {
  try {
    // Initialize OpenAI service
    const openAIService = new OpenAIService();

    // Read verify.txt file
    const verifyContent = fs.readFileSync(verifyFilePath, "utf8");

    // Split into lines and clean them
    const verifyLines = verifyContent
      .split("\n")
      .map((line) => line.replace(/\r$/, "").trim())
      .filter((line) => line);

    console.log(`Total lines to verify: ${verifyLines.length}`);

    // Process each line and collect the results
    const correctIds: string[] = [];

    for (const line of verifyLines) {
      // Extract ID and content
      const match = line.match(/^(\d+)=(.*)/);
      if (!match) {
        console.warn(`Invalid line format: ${line}`);
        continue;
      }

      const id = match[1];
      const content = match[2];

      // Create messages in the same format as training data
      const messages = [
        { role: "system", content: "validate data" },
        { role: "user", content: content },
      ] as ChatCompletionMessageParam[];

      try {
        // Send to the fine-tuned model
        const response = await openAIService.completion(messages, MODEL_NAME);

        // Extract the result
        const result = (
          response as ChatCompletion
        ).choices[0].message.content?.trim();

        console.log(`ID: ${id}, Content: ${content}, Result: ${result}`);

        // If the result is "1" or "true", consider it correct
        if (result === "1" || result === "true") {
          correctIds.push(id);
        }
      } catch (error) {
        console.error(`Error processing line ${id}: ${error}`);
      }
    }

    console.log(`Found ${correctIds.length} correct entries:`);
    console.log(correctIds);

    // Send answer to centrala
    await sendAnswerToCentrala(correctIds, "research");

    return correctIds;
  } catch (error) {
    console.error("Error verifying data:", error);
    throw error;
  }
}

// Execute the function
verifyData()
  .then((result) => {
    console.log("Verification completed successfully!");
  })
  .catch((err) => {
    console.error("Verification failed:", err);
  });
