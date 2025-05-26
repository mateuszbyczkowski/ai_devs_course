import fs from "fs";
import path from "path";

/**
 * Writes the indexed content to a file
 * 
 * @param content - The processed article content in markdown format
 * @param outputDir - The directory to write the file to
 * @returns The path to the written file
 */
export function writeIndexedContent(content: string, outputDir: string): string {
  const outputPath = path.join(outputDir, "indexed_content.md");
  fs.writeFileSync(outputPath, content);
  return outputPath;
}

/**
 * Safely extracts the filename from a URL
 * 
 * @param url - The URL to extract the filename from
 * @returns The extracted filename
 */
export function getFilenameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    return path.basename(pathname);
  } catch (error) {
    // If URL parsing fails, extract the filename from the path portion
    const parts = url.split('/');
    return parts[parts.length - 1];
  }
}

/**
 * Creates all necessary directories for a given file path
 * 
 * @param filePath - The full path to the file
 */
export function ensureDirectoryExists(filePath: string): void {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
}