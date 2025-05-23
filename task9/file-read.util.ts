import path from "path";
import fs from "fs";
import { OpenAIService } from "../services/OpenAIService";

// Define types
export type FileContent = {
  filePath: string;
  content: string;
  type: "text" | "audio" | "image";
};

/**
 * Checks if a file has already been processed and exists in the output directory
 */
export async function isFileAlreadyProcessed(
  originalFile: string,
  outputDir: string,
): Promise<boolean> {
  const fileName = path.basename(originalFile);
  const baseName = path.parse(fileName).name;
  const outputFiles = await fs.promises.readdir(outputDir);

  // For audio and image files, check if a corresponding .txt exists
  if (fileName.endsWith(".mp3") || fileName.endsWith(".png")) {
    return outputFiles.includes(`${baseName}.txt`);
  }

  // For text files, check if they exist in the all_content.json
  if (fileName.endsWith(".txt")) {
    const allContentPath = path.join(outputDir, "all_content.json");
    if (fs.existsSync(allContentPath)) {
      const allContent = JSON.parse(
        await fs.promises.readFile(allContentPath, "utf-8"),
      );
      return allContent.some(
        (item: any) => path.basename(item.filePath) === fileName,
      );
    }
  }

  return false;
}

/**
 * Loads a file that has already been processed from the output directory
 */
export async function loadProcessedFile(
  fileName: string,
  outputDir: string,
): Promise<FileContent | null> {
  const baseName = path.parse(fileName).name;

  try {
    // For audio and image files, read the corresponding .txt file
    if (fileName.endsWith(".mp3") || fileName.endsWith(".png")) {
      const txtPath = path.join(outputDir, `${baseName}.txt`);
      if (fs.existsSync(txtPath)) {
        const content = await fs.promises.readFile(txtPath, "utf-8");
        return {
          filePath: path.join(
            process.cwd(),
            "zad9",
            "pliki_z_fabryki",
            fileName,
          ),
          content,
          type: fileName.endsWith(".mp3") ? "audio" : "image",
        };
      }
    }

    // For text files, check if they exist in the all_content.json
    if (fileName.endsWith(".txt")) {
      const allContentPath = path.join(outputDir, "all_content.json");
      if (fs.existsSync(allContentPath)) {
        const allContent = JSON.parse(
          await fs.promises.readFile(allContentPath, "utf-8"),
        );
        const foundFile = allContent.find(
          (item: any) => path.basename(item.filePath) === fileName,
        );
        if (foundFile) {
          return foundFile;
        }
      }
    }
  } catch (error) {
    console.error(`Error loading processed file ${fileName}:`, error);
  }

  return null;
}

/**
 * Reads text files from the specified directory
 */
export async function readTextFiles(
  directory: string,
  outputDir: string,
): Promise<FileContent[]> {
  const results: FileContent[] = [];
  const files = await fs.promises.readdir(directory);

  for (const file of files) {
    if (file.endsWith(".txt")) {
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
      const content = await fs.promises.readFile(filePath, "utf-8");
      results.push({
        filePath,
        content,
        type: "text",
      });
    }
  }

  return results;
}
