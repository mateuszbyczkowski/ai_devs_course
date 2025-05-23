import dotenv from "dotenv";
import fs from "fs";
import axios from "axios";
import { OpenAIService } from "../services/OpenAIService";
import {
  type FileContent,
  isFileAlreadyProcessed,
  loadProcessedFile,
  readTextFiles,
} from "./file-read.util";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env") });

type CategorizationResult = {
  people: string[];
  hardware: string[];
};

/**
 * Transcribes MP3 files using OpenAI Whisper
 */
async function transcribeAudioFiles(
  directory: string,
  outputDir: string,
  openAIService: OpenAIService,
): Promise<FileContent[]> {
  const results: FileContent[] = [];
  const files = await fs.promises.readdir(directory);

  for (const file of files) {
    if (file.endsWith(".mp3")) {
      const filePath = path.join(directory, file);

      // Check if the file has already been processed
      const isProcessed = await isFileAlreadyProcessed(filePath, outputDir);

      if (isProcessed) {
        console.log(
          `File ${file} has already been processed, loading from output.`,
        );
        const processedFile = await loadProcessedFile(file, outputDir);
        if (processedFile) {
          results.push(processedFile);
          continue;
        }
      }

      // Process the file if it hasn't been processed or couldn't be loaded
      console.log(`Transcribing audio file: ${filePath}`);

      try {
        const fileStream = fs.createReadStream(filePath);
        const transcription = await openAIService.createTranscription({
          file: fileStream as any,
          model: "whisper-1",
        });

        results.push({
          filePath,
          content: transcription,
          type: "audio",
        });

        console.log(`Transcription completed for: ${filePath}`);

        // Save transcription to output directory for reference
        const outputPath = path.join(
          outputDir,
          `${path.basename(file, ".mp3")}.txt`,
        );
        await fs.promises.writeFile(outputPath, transcription);
      } catch (error) {
        console.error(`Error transcribing ${filePath}:`, error);
      }
    }
  }

  return results;
}

/**
 * Analyzes image files using GPT-4o
 */
async function analyzeImageFiles(
  directory: string,
  outputDir: string,
  openAIService: OpenAIService,
): Promise<FileContent[]> {
  const results: FileContent[] = [];
  const files = await fs.promises.readdir(directory);

  for (const file of files) {
    if (file.endsWith(".png")) {
      const filePath = path.join(directory, file);

      // Check if the file has already been processed
      const isProcessed = await isFileAlreadyProcessed(filePath, outputDir);

      if (isProcessed) {
        console.log(
          `File ${file} has already been processed, loading from output.`,
        );
        const processedFile = await loadProcessedFile(file, outputDir);
        if (processedFile) {
          results.push(processedFile);
          continue;
        }
      }

      // Process the file if it hasn't been processed or couldn't be loaded
      console.log(`Analyzing image file: ${filePath}`);

      try {
        // Read image as base64
        const imageBuffer = await fs.promises.readFile(filePath);
        const base64Image = imageBuffer.toString("base64");

        // Use GPT-4o to analyze the image
        const response = await openAIService.completion(
          [
            {
              role: "system",
              content:
                "You are an expert at analyzing images and extracting text content. Extract and transcribe all visible text from the image exactly as written, preserving the original language. Do not translate any text. Focus primarily on the text content. Present your findings using original language.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract all text and important details from this image.",
                },
                {
                  type: "image_url",
                  image_url: { url: `data:image/png;base64,${base64Image}` },
                },
              ],
            },
          ],
          "gpt-4o",
        );

        const analysis = (response as any).choices[0].message.content;

        results.push({
          filePath,
          content: analysis,
          type: "image",
        });

        console.log(`Analysis completed for: ${filePath}`);

        // Save analysis to output directory for reference
        const outputPath = path.join(
          outputDir,
          `${path.basename(file, ".png")}.txt`,
        );
        await fs.promises.writeFile(outputPath, analysis);
      } catch (error) {
        console.error(`Error analyzing ${filePath}:`, error);
      }
    }
  }

  return results;
}

/**
 * Categorizes files using OpenAI model
 * - People: Files containing information about captured people or traces of their presence
 * - Hardware: Files containing information about hardware issues (not software)
 */
async function categorizeFilesWithAI(
  files: FileContent[],
  openAIService: OpenAIService,
): Promise<CategorizationResult> {
  const result: CategorizationResult = {
    people: [],
    hardware: [],
  };

  console.log(`Categorizing ${files.length} files using OpenAI...`);

  // Build prompt with all file contents
  const prompt = `
I need to categorize the following files based on their content:

${files
  .map(
    (file, index) =>
      `File ${index + 1}: ${path.basename(file.filePath)}\n${file.content}\n---\n`,
  )
  .join("\n")}

Please categorize each file into one of these categories:
1. People - ONLY include files containing information about captured people or traces of their presence (like fingerprints). Files must explicitly mention someone being caught, arrested, or specific evidence of human presence. Do NOT include files that just mention humans in general, mention unsuccessful searches, or where nobody was found.
2. Hardware - ONLY include files containing information about physical hardware issues and repairs (not software). This includes antenna repairs, cable damage, battery/cell replacements, and physical components. Do NOT include software updates, system updates, AI module updates, algorithm improvements, or communication protocol changes.
3. None - if the file doesn't fit into either category.

Format your response as a JSON object with the following structure:
{
  "people": ["filename1", "filename2", ...],
  "hardware": ["filename3", "filename4", ...]
}
Only include the filenames (not full paths) and only include files that match the categories. Sort the filenames alphabetically in each category.`;

  try {
    const response = await openAIService.completion(
      [
        {
          role: "system",
          content:
            "You are an expert at categorizing documents based on their content. You analyze text carefully and categorize files strictly according to the provided criteria. Be conservative in your categorization - when in doubt, do NOT include a file in a category. Your response must be a valid JSON object.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      "gpt-4.1",
    ); // Not using JSON mode as it's not supported with gpt-4

    const categorization = (response as any).choices[0].message.content;
    let parsedCategorization;
    try {
      parsedCategorization = JSON.parse(categorization);
    } catch (error) {
      console.error("Error parsing JSON response:", error);
      console.error("Response content:", categorization);
      throw new Error("Failed to parse JSON response from OpenAI");
    }

    // Ensure we have the expected structure
    if (
      parsedCategorization.people &&
      Array.isArray(parsedCategorization.people)
    ) {
      result.people = parsedCategorization.people.sort();
    }

    if (
      parsedCategorization.hardware &&
      Array.isArray(parsedCategorization.hardware)
    ) {
      result.hardware = parsedCategorization.hardware.sort();
    }

    console.log("Categorization completed using OpenAI model.");
  } catch (error) {
    console.error("Error in AI categorization:", error);
  }

  return result;
}

/**
 * Main execution function
 */
async function main() {
  try {
    const openAIService = new OpenAIService();
    const sourceDirectory = path.join(__dirname, "pliki_z_fabryki");
    const outputDir = path.join(__dirname, "output");

    console.log("Starting to process files from factory...");

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    // Process text files
    console.log("Reading text files...");
    const textFiles = await readTextFiles(sourceDirectory, outputDir);

    // Process audio files
    console.log("Transcribing audio files...");
    const audioFiles = await transcribeAudioFiles(
      sourceDirectory,
      outputDir,
      openAIService,
    );

    // Process image files
    console.log("Analyzing image files...");
    const imageFiles = await analyzeImageFiles(
      sourceDirectory,
      outputDir,
      openAIService,
    );

    // Combine all results
    const allFiles = [...textFiles, ...audioFiles, ...imageFiles];

    // Save all results to a single JSON file
    const outputPath = path.join(outputDir, "all_content.json");
    await fs.promises.writeFile(outputPath, JSON.stringify(allFiles, null, 2));

    console.log(`Processing completed. Results saved to ${outputPath}`);

    // Categorize files using OpenAI
    console.log("Categorizing files using OpenAI...");
    const categorization = await categorizeFilesWithAI(allFiles, openAIService);

    // Save categorization result
    const categorizationPath = path.join(outputDir, "categorization.json");
    await fs.promises.writeFile(
      categorizationPath,
      JSON.stringify({ answer: categorization }, null, 2),
    );

    console.log(
      `Categorization completed. Results saved to ${categorizationPath}`,
    );

    // Submit categorization to API
    console.log("Submitting categorization to API...");
    const apiResponse = await submitCategorization(categorization);
    console.log("API response:", apiResponse);

    // Return the results for further processing
    return { allFiles, categorization, apiResponse };
  } catch (error) {
    console.error("Error in main process:", error);
    throw error;
  }
}

// Run the main function if this module is executed directly
if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

/**
 * Submits categorization results to the API
 */
async function submitCategorization(
  categorization: CategorizationResult,
): Promise<any> {
  const payload = {
    task: "kategorie",
    apikey: process.env.PERSONAL_API_KEY,
    answer: categorization,
  };

  try {
    const response = await axios.post(
      "https://c3ntrala.ag3nts.org/report",
      payload,
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      },
    );
    return response.data;
  } catch (error) {
    console.error("Error submitting categorization:", error);
    throw error;
  }
}

// Export the main function for potential use in other modules
export { main };
