import axios from "axios";

/**
 * Fetches questions from the centrala API using the provided API key
 * 
 * @param apiKey - Personal API key from .env file
 * @returns Object with question IDs as keys and question text as values
 */
export async function fetchQuestions(apiKey: string): Promise<Record<string, string>> {
  try {
    const url = `${process.env.CENTRALA}/data/${apiKey}/arxiv.txt`;
    const response = await axios.get(url);
    
    if (typeof response.data !== 'string') {
      throw new Error("Unexpected response format");
    }
    
    // Parse the questions from the response
    // Expected format: lines with "XX=Question text"
    const questionsData = response.data.trim().split('\n');
    const questions: Record<string, string> = {};
    
    for (const line of questionsData) {
      // Extract question ID and text
      const match = line.match(/^(\d+)=(.+)$/);
      if (match && match.length === 3) {
        const [, id, text] = match;
        // Pad ID with leading zero if necessary (e.g., 1 -> 01)
        const paddedId = id.padStart(2, '0');
        questions[paddedId] = text.trim();
      }
    }
    
    console.log(`Fetched ${Object.keys(questions).length} questions`);
    return questions;
  } catch (error) {
    console.error("Error fetching questions:", error);
    throw error;
  }
}