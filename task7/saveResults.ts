import fs from 'fs';
import path from 'path';

/**
 * Saves analysis results to a text file
 * 
 * @param results The text content to save
 * @param filename Optional custom filename (defaults to 'analysis_results.txt')
 * @returns Promise that resolves with the file path when save is complete
 */
export async function saveResults(
  results: string, 
  filename: string = 'analysis_results.txt'
): Promise<string> {
  try {
    // Ensure filename has .txt extension
    if (!filename.endsWith('.txt')) {
      filename = `${filename}.txt`;
    }
    
    // Create full path
    const filePath = path.join(__dirname, filename);
    
    // Write to file (using promises version for async/await)
    await fs.promises.writeFile(filePath, results, 'utf8');
    
    console.log(`Results saved to: ${filePath}`);
    return filePath;
  } catch (error) {
    console.error('Error saving results:', error);
    throw error;
  }
}

/**
 * Appends text to an existing file or creates a new one
 * 
 * @param text The text content to append
 * @param filename The file to append to
 * @returns Promise that resolves when append is complete
 */
export async function appendToFile(
  text: string,
  filename: string
): Promise<void> {
  try {
    const filePath = path.join(__dirname, filename);
    await fs.promises.appendFile(filePath, text, 'utf8');
    console.log(`Text appended to: ${filePath}`);
  } catch (error) {
    console.error('Error appending to file:', error);
    throw error;
  }
}