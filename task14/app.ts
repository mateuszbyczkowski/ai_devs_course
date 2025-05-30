import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { OpenAIService } from "../services/OpenAIService";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Utility function to remove Polish diacritics
function removePolishDiacritics(text: string): string {
  const diacriticsMap: Record<string, string> = {
    ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
    Ą: "A", Ć: "C", Ę: "E", Ł: "L", Ń: "N", Ó: "O", Ś: "S", Ź: "Z", Ż: "Z",
  };

  return text
    .split("")
    .map((char) => diacriticsMap[char] || char)
    .join("");
}

// Main function to analyze the note using OpenAI
async function analyzeNoteWithOpenAI(): Promise<void> {
  // 1. Read the barbara.txt note file
  const notePath = path.resolve(__dirname, "barbara.txt");
  const noteContent = fs.readFileSync(notePath, "utf-8");
  console.log("Note content loaded successfully");

  // 2. Use OpenAI to extract names and places
  const openAIService = new OpenAIService();
  
  let names: string[] = [];
  let places: string[] = [];
  
  try {
    const messages: ChatCompletionMessageParam[] = [
      { 
        role: "system", 
        content: "Extract all person names and place names from the provided Polish text. Return the result as a JSON object with two arrays: 'names' for person names and 'places' for place names. Include full names where available. Names array should contain strings like 'Barbara Zawadzka'. Places array should contain strings like 'Kraków', 'Warszawa'." 
      },
      { 
        role: "user", 
        content: noteContent 
      }
    ];
    
    const response = await openAIService.completion(messages, "gpt-4", false, true);
    const content = (response as any).choices[0].message.content;
    
    try {
      const extractedData = JSON.parse(content);
      names = extractedData.names || [];
      places = extractedData.places || [];
      console.log("OpenAI extraction successful");
    } catch (parseError) {
      console.error("Error parsing OpenAI response:", parseError);
      console.error("Raw response:", content);
  
    }
  } catch (aiError) {
    console.error("Error calling OpenAI API:", aiError);
  }

  // 3. Remove diacritics from extracted data
  const namesWithoutDiacritics = names.map(name => removePolishDiacritics(name));
  const placesWithoutDiacritics = places.map(place => removePolishDiacritics(place));

  // 4. Print the results
  console.log("Original names extracted:", names);
  console.log("Names without diacritics:", namesWithoutDiacritics);
  console.log("Original places extracted:", places);
  console.log("Places without diacritics:", placesWithoutDiacritics);
  
  // Verify extraction was successful
  if (names.length === 0) {
    console.warn("Warning: No names were extracted from the note");
  }
  if (places.length === 0) {
    console.warn("Warning: No places were extracted from the note");
  }

  // 5. Prepare queues for search
  const peopleQueue = new Set<string>();
  const placesQueue = new Set<string>();
  
  // Add names to people queue (first names only, uppercase)
  namesWithoutDiacritics.forEach(name => {
    const firstName = name.split(" ")[0];
    peopleQueue.add(firstName.toUpperCase());
  });
  
  // Add places to places queue (uppercase)
  placesWithoutDiacritics.forEach(place => {
    placesQueue.add(place.toUpperCase());
  });

  // Print the prepared queues
  console.log("People queue for search:", [...peopleQueue]);
  console.log("Places queue for search:", [...placesQueue]);
}

// Execute the analysis
async function main() {
  try {
    console.log("Starting analysis of the barbara.txt note with OpenAI...");
    await analyzeNoteWithOpenAI();
    console.log("Analysis completed successfully");
  } catch (error) {
    console.error("Error during analysis:", error);
    process.exit(1);
  }
}

main();