import { OpenAIService } from "../services/OpenAIService";
import { VectorService } from "../services/VectorService";
import fs from "fs/promises";
import path from "path";
import { sendAnswerToCentrala } from "./send_answer";

// The query we need to answer
const query =
  "W raporcie, z którego dnia znajduje się wzmianka o kradzieży prototypu broni?";

// Collection name for vector database
const COLLECTION_NAME = "reports";

// Initialize services
const openai = new OpenAIService();
const vectorService = new VectorService(openai);

// Function to parse date from filename and convert to YYYY-MM-DD format
function parseDateFromFilename(filename: string): string {
  const match = filename.match(/(\d{4})_(\d{2})_(\d{2})/);
  if (!match) {
    throw new Error(`Invalid filename format: ${filename}`);
  }
  const [_, year, month, day] = match;
  return `${year}-${month}-${day}`;
}

// Read all reports from the do-not-share directory
async function readReports(): Promise<
  Array<{ text: string; date: string; filename: string }>
> {
  const reportsDir = path.join(__dirname, "do-not-share");
  const files = await fs.readdir(reportsDir);
  const reportFiles = files.filter((file) => file.endsWith(".txt"));

  const reports = await Promise.all(
    reportFiles.map(async (file) => {
      const filePath = path.join(reportsDir, file);
      const content = await fs.readFile(filePath, "utf-8");
      const date = parseDateFromFilename(file);

      return {
        text: content,
        date,
        filename: file,
      };
    }),
  );

  return reports;
}

// Initialize collection with report data
async function initializeData() {
  try {
    // Read all reports
    const reports = await readReports();
    console.log(`Found ${reports.length} reports`);

    // Convert reports to points for vector database
    const points = reports.map(({ text, date, filename }) => ({
      text,
      metadata: {
        date,
        filename,
      },
    }));

    // Initialize collection with data
    await vectorService.ensureCollection(COLLECTION_NAME, 3072);
    await vectorService.addPoints(COLLECTION_NAME, points);
    console.log("Collection initialized with report data");
  } catch (error) {
    console.error("Error initializing data:", error);
  }
}

// Search for reports mentioning theft of prototype weapon
async function searchReports(): Promise<string | undefined> {
  try {
    console.log(`Searching for answer to: "${query}"`);

    // Use vector search
    const results = await vectorService.performSearch(
      COLLECTION_NAME,
      query,
      {},
      1,
    );

    if (results.length > 0) {
      console.log(`\nBest match: Report from ${results[0]?.payload?.date}`);
      console.log(`Score: ${results[0].score}`);
      return results[0]?.payload?.date;
    } else {
      console.log("No matching results found");
    }
  } catch (error) {
    console.error("Error searching reports:", error);
  }
}

async function main() {
  try {
    // Initialize data in vector database
    await initializeData();

    // Search for the answer
    const result = await searchReports();
    if (result) {
      sendAnswerToCentrala(result);
    }
  } catch (error) {
    console.error("Error in main function:", error);
  }
}

main().catch(console.error);
