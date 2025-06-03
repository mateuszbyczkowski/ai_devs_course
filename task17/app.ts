import * as fs from "fs";
import * as path from "path";
import { OpenAIService } from "../services/OpenAIService";
import { sendAnswerToCentrala } from "../services/CentralaAPIService";
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
} from "openai/resources/index.mjs";

/**
 * Task 17: Fine-tuning Model with Lab Data
 *
 * Part 1: Prepare training data
 * - Processes correct.txt and incorect.txt lab data into a JSONL format
 *   suitable for fine-tuning a gpt-4.1-mini model.
 *
 * Part 2: Verify test data
 * - Uses the fine-tuned model to analyze data in verify.txt
 * - Collects IDs of entries that are validated as correct (1)
 * - Submits these IDs to the central API
 *
 * The JSONL format follows OpenAI's supervised fine-tuning specification:
 * https://platform.openai.com/docs/guides/supervised-fine-tuning
 *
 * Each entry has:
 * - system message: "validate data"
 * - user message: content from the data file
 * - assistant message: "1" for correct data, "0" for incorrect data
 */

// Configuration
const MODEL_NAME = process.env.FINETUNE_MODEL || "gpt-4.1-mini"; // Replace with actual fine-tuned model name
const trainingDataPath = `${__dirname}/training_data.jsonl`;
const verifyFilePath = path.join(__dirname, "lab_data", "verify.txt");

async function main() {
  // PART 1: Check and report on training data
  if (fs.existsSync(trainingDataPath)) {
    // Count the entries in the file
    const fileContent = fs.readFileSync(trainingDataPath, "utf8");
    const lines = fileContent.split("\n").filter((line) => line.trim());

    console.log("Part 1: Training data summary:");
    console.log(`- Total entries: ${lines.length}`);

    // Count the number of entries with "1" (correct) and "0" (incorrect)
    const correct = lines.filter((line) =>
      line.includes('"assistant","content":"1"'),
    ).length;
    const incorrect = lines.filter((line) =>
      line.includes('"assistant","content":"0"'),
    ).length;

    console.log(`- Correct entries (1): ${correct}`);
    console.log(`- Incorrect entries (0): ${incorrect}`);

    console.log("\nTo use this file for fine-tuning with OpenAI:");
    console.log("1. Create a fine-tuning job using OpenAI API");
    console.log("2. Upload the training_data.jsonl file");
    console.log("3. Select gpt-4.1-mini as the base model");
    console.log("4. Wait for the fine-tuning process to complete");
  } else {
    console.log("Training data file not found!");
    console.log(
      "Run the create_finetune_data.ts script first to generate the JSONL file.",
    );
    return;
  }

  // PART 2: Verify data using the fine-tuned model
  try {
    console.log(
      "\nPart 2: Verifying data from verify.txt using the fine-tuned model...",
    );

    // Initialize OpenAI service
    const openAIService = new OpenAIService();

    // Read verify.txt file
    if (!fs.existsSync(verifyFilePath)) {
      console.error("Verify file not found:", verifyFilePath);
      return;
    }

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

      const id = match[1]; // Keep the ID exactly as it appears in the file
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

    console.log(
      `Found ${correctIds.length} correct entries with IDs:`,
      correctIds,
    );

    // Send answer to centrala
    await sendAnswerToCentrala(correctIds, "research");

    console.log("Verification completed and results sent to central API!");
  } catch (error) {
    console.error("Error in verification process:", error);
  }
}

// Run the main function
main().catch((err) => console.error("Application error:", err));
