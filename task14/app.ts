import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import axios from "axios";
import { OpenAIService } from "../services/OpenAIService";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { sendAnswerToCentrala } from "../services/CentralaAPIService";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

interface ApiResponse {
  code: number;
  message: string;
}

type VisitTracking = {
  timestamp: number;
  prev?: string; // Previous node in the discovery path
};

// Utility function to remove Polish diacritics
function removePolishDiacritics(text: string): string {
  const diacriticsMap: Record<string, string> = {
    ą: "a",
    ć: "c",
    ę: "e",
    ł: "l",
    ń: "n",
    ó: "o",
    ś: "s",
    ź: "z",
    ż: "z",
    Ą: "A",
    Ć: "C",
    Ę: "E",
    Ł: "L",
    Ń: "N",
    Ó: "O",
    Ś: "S",
    Ź: "Z",
    Ż: "Z",
  };

  return text
    .split("")
    .map((char) => diacriticsMap[char] || char)
    .join("");
}

// API query functions
async function queryPeopleApi(name: string): Promise<string[]> {
  try {
    console.log(`Querying people API for name: ${name}`);

    if (name.includes("*") || name.includes("://") || name.includes("DATA**")) {
      return [];
    }

    const response = await axios.post(`${process.env.CENTRALA}/people`, {
      apikey: process.env.PERSONAL_API_KEY,
      query: name.toUpperCase(),
    });

    console.log(
      `Response for ${name}:`,
      JSON.stringify(response.data, null, 2),
    );

    // Extract places from the message string
    const apiResponse = response.data as ApiResponse;
    if (apiResponse.code === 0 && apiResponse.message) {
      return apiResponse.message.split(" ");
    }

    return [];
  } catch (error) {
    console.error(`Error querying people API for ${name}:`, error);
    return [];
  }
}

async function queryPlacesApi(place: string): Promise<string[]> {
  try {
    console.log(`Querying places API for place: ${place}`);

    if (
      place.includes("*") ||
      place.includes("://") ||
      place.includes("DATA**")
    ) {
      return [];
    }

    const response = await axios.post(`${process.env.CENTRALA}/places`, {
      apikey: process.env.PERSONAL_API_KEY,
      query: place.toUpperCase(),
    });

    console.log(
      `Response for ${place}:`,
      JSON.stringify(response.data, null, 2),
    );

    const apiResponse = response.data as ApiResponse;
    if (apiResponse.code === 0 && apiResponse.message) {
      return apiResponse.message.split(" ");
    }

    return [];
  } catch (error) {
    console.error(`Error querying places API for ${place}:`, error);
    return [];
  }
}

// Main function to analyze the note using OpenAI
async function analyzeNoteAndFindBarbara(): Promise<void> {
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
        content: `Extract all person names and place names from the provided Polish text. DON'T EXTRACT SURNAMES. Return the result as a JSON object with two arrays: 'names' for person names and 'places' for place names. Include full names where available. Names array should contain strings like 'Barbara Zawadzka'.
          Places array should contain strings like 'KRAKOW', 'WARSZAWA'. Use only nominative form in uppercase without polish letters.
          <examples>
            {
              "names": ["JAN", "ANNA", "BARBARA"],
              "places": ["WARSZAWA", "KRAKOW"]
            }
          </examples>`,
      },
      {
        role: "user",
        content: noteContent,
      },
    ];

    const response = await openAIService.completion(
      messages,
      "gpt-4.1",
      false,
      true,
    );
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
  const namesWithoutDiacritics = names.map((name) =>
    removePolishDiacritics(name),
  );
  const placesWithoutDiacritics = places.map((place) =>
    removePolishDiacritics(place),
  );

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
  const visitedPeople = new Set<string>();
  const visitedPlaces = new Set<string>();
  const initialPlaces = new Set<string>();

  // Track locations where Barbara was found with discovery metadata
  const barbaraLocations = new Map<string, VisitTracking>();

  // Add names to people queue (first names only, uppercase)
  namesWithoutDiacritics.forEach((name) => {
    console.log(name);
    const firstName = name.split(" ")[0];
    peopleQueue.add(firstName.toUpperCase());
  });

  // Add places to places queue (uppercase) and track initial places
  placesWithoutDiacritics.forEach((place) => {
    const upperPlace = place.toUpperCase();
    placesQueue.add(upperPlace);
    initialPlaces.add(upperPlace);
  });

  // Print the prepared queues
  console.log("People queue for search:", [...peopleQueue]);
  console.log("Places queue for search:", [...placesQueue]);
  console.log("Initial places from note:", [...initialPlaces]);

  // 6. Iterative API querying

  while (peopleQueue.size > 0 || placesQueue.size > 0) {
    // Process people queue
    if (peopleQueue.size > 0) {
      const personName = [...peopleQueue][0];
      peopleQueue.delete(personName);

      if (!visitedPeople.has(personName)) {
        visitedPeople.add(personName);
        console.log(`Checking person: ${personName}`);

        const places = await queryPeopleApi(personName);
        if (places.length > 0) {
          console.log(
            `${personName} is connected to places: ${places.join(", ")}`,
          );

          // Add new places to the queue
          places.forEach((place) => {
            const normalizedPlace = removePolishDiacritics(place).toUpperCase();
            if (!visitedPlaces.has(normalizedPlace)) {
              placesQueue.add(normalizedPlace);
            }
          });
        }
      }
    }

    // Process places queue
    if (placesQueue.size > 0) {
      const placeName = [...placesQueue][0];
      placesQueue.delete(placeName);

      if (!visitedPlaces.has(placeName)) {
        visitedPlaces.add(placeName);
        console.log(`Checking place: ${placeName}`);

        const people = await queryPlacesApi(placeName);
        if (people.length > 0) {
          console.log(
            `${placeName} is connected to people: ${people.join(", ")}`,
          );

          // Check if BARBARA is in the list of people for this place
          if (people.includes("BARBARA")) {
            console.log(`Found BARBARA in ${placeName}!`);

            // Store discovery metadata - when it was found and from where
            const prevPersons = [...visitedPeople]
              .filter((p) => p !== "BARBARA")
              .slice(-1)[0];
            barbaraLocations.set(placeName, {
              timestamp: Date.now(),
              prev: prevPersons,
            });

            // If this is a new location (not in initial places), it could be Barbara's current location
            if (!initialPlaces.has(placeName)) {
              console.log(
                `This is a new location, not mentioned in the original note!`,
              );
            }
          }

          // Add new people to the queue
          people.forEach((person) => {
            if (!visitedPeople.has(person)) {
              peopleQueue.add(person);
            }
          });
        }
      }
    }

    // Add small delay to avoid API rate limits
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  // 7. Log results
  console.log("\n=== Search complete ===\n");

  if (barbaraLocations.size > 0) {
    console.log(
      `Barbara was found in these locations: ${[...barbaraLocations.keys()].join(", ")}`,
    );

    // Filter for locations not in the original note - these are new discoveries
    const newLocationEntries = [...barbaraLocations.entries()]
      .filter(([location]) => !initialPlaces.has(location))
      .sort((a, b) => b[1].timestamp - a[1].timestamp); // Sort by discovery time (most recent first)

    if (newLocationEntries.length > 0) {
      // The most recently discovered location is likely Barbara's current location
      const currentLocation = newLocationEntries[0][0];
      console.log(`Barbara's current location is: ${currentLocation}`);
      sendAnswerToCentrala(currentLocation, "loop");
      return;
    } else {
      // If no new locations, use the most recently discovered location from any location
      const sortedLocations = [...barbaraLocations.entries()].sort(
        (a, b) => b[1].timestamp - a[1].timestamp,
      );

      const lastKnownLocation = sortedLocations[0][0];
      console.log(`Barbara's last known location is: ${lastKnownLocation}`);
      return;
    }
  }
}

// Execute the analysis
async function main() {
  try {
    console.log("Starting search for Barbara...");
    await analyzeNoteAndFindBarbara();
  } catch (error) {
    console.error("Error during analysis:", error);
    process.exit(1);
  }
}

main();
