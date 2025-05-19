import fs from "fs";
import path from "path";
import { Readable } from "stream";
import axios from "axios";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import { OpenAIService } from "../services/OpenAIService";
import { LangfuseService } from "../services/LangfuseService";
import { LangfuseTraceClient, LangfuseSpanClient } from "langfuse";
import type { ChatCompletion } from "openai/resources/chat/completions";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Paths
const INTERROGATIONS_DIR = path.join(__dirname, "przesluchania");
const OUTPUT_DIR = path.join(__dirname, "transcripts");
const ANALYSIS_OUTPUT = path.join(__dirname, "analysis_result.json");

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Initialize services
const openAIService = new OpenAIService();
const langfuseService = new LangfuseService();

interface Transcript {
  fileName: string;
  personName: string;
  content: string;
}

interface AnalysisResult {
  streetName: string;
  instituteName: string;
  confidence: number;
  reasoning: string;
}

/**
 * Main function to find Professor Maj's institute location
 */
export async function findProfessorLocation(): Promise<AnalysisResult> {
  // Create a trace for the entire process
  const sessionId = uuidv4();
  const trace = langfuseService.createTrace({
    id: uuidv4(),
    name: "Professor Location Analysis",
    sessionId: sessionId,
  });

  try {
    console.log(
      "Starting analysis to find Professor Maj's institute location...",
    );

    // Step 1: Transcribe all audio files
    const transcriptionSpan = langfuseService.createSpan(
      trace,
      "Audio Transcription",
    );
    const transcripts = await transcribeFiles(trace);
    transcriptionSpan.end();

    // Step 2: Analyze transcripts to find the street name
    const analysisSpan = langfuseService.createSpan(
      trace,
      "Transcript Analysis",
    );
    const analysisResult = await analyzeTranscripts(transcripts, trace);
    analysisSpan.end();

    // Step 3: Save analysis result
    fs.writeFileSync(ANALYSIS_OUTPUT, JSON.stringify(analysisResult, null, 2));

    // Step 4: Submit result to API
    const submissionSpan = langfuseService.createSpan(
      trace,
      "Result Submission",
    );
    await submitResult(analysisResult.streetName);
    submissionSpan.end();

    // Update the trace with the final result
    await trace.update({
      output: JSON.stringify(analysisResult),
    });

    await langfuseService.langfuse.flushAsync();
    return analysisResult;
  } catch (error) {
    console.error("Error finding professor location:", error);
    // Log the error to Langfuse
    trace.update({
      status: "error",
      statusMessage: error instanceof Error ? error.message : String(error),
    });
    await langfuseService.langfuse.flushAsync();
    throw error;
  }
}

/**
 * Transcribe audio files using OpenAI Whisper API
 */
async function transcribeFiles(
  trace: LangfuseTraceClient,
): Promise<Transcript[]> {
  console.log("Transcribing audio files...");

  const files = fs
    .readdirSync(INTERROGATIONS_DIR)
    .filter((file) => file.endsWith(".m4a"));

  const transcripts: Transcript[] = [];

  for (const file of files) {
    const filePath = path.join(INTERROGATIONS_DIR, file);
    const outputPath = path.join(OUTPUT_DIR, `${path.parse(file).name}.txt`);

    // Create a span for each file transcription
    const fileSpan = langfuseService.createSpan(trace, `Transcribe: ${file}`);

    // Check if transcript already exists to avoid re-transcribing
    if (fs.existsSync(outputPath)) {
      console.log(`Transcript for ${file} already exists, skipping...`);
      const content = fs.readFileSync(outputPath, "utf-8");
      transcripts.push({
        fileName: file,
        personName: path.parse(file).name,
        content,
      });
      fileSpan.end({
        status: "success",
        statusMessage: "Used cached transcript",
      });
      continue;
    }

    console.log(`Transcribing ${file}...`);

    try {
      // Use OpenAI Whisper for transcription
      const transcription = await transcribeWithWhisper(filePath, fileSpan);

      // Save transcription
      fs.writeFileSync(outputPath, transcription);

      // Add to transcripts array
      transcripts.push({
        fileName: file,
        personName: path.parse(file).name,
        content: transcription,
      });

      console.log(`Successfully transcribed ${file}`);
      fileSpan.end({ status: "success" });
    } catch (error) {
      console.error(`Error transcribing ${file}:`, error);
      fileSpan.end({
        status: "error",
        statusMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return transcripts;
}

/**
 * Transcribe audio using OpenAI Whisper API
 */
async function transcribeWithWhisper(
  audioPath: string,
  parentSpan: LangfuseSpanClient,
): Promise<string> {
  try {
    // Check if file exists and is accessible
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const fileStats = fs.statSync(audioPath);
    if (fileStats.size === 0) {
      throw new Error(`Audio file is empty: ${audioPath}`);
    }

    // Add timeout and retry logic for robustness
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      // Create a fresh file stream for each attempt
      const audioFile = fs.createReadStream(audioPath);

      // Create a span for each attempt
      const attemptSpan = langfuseService.createSpan(
        parentSpan,
        `Whisper Attempt ${attempts + 1}`,
        { filePath: audioPath, attempt: attempts + 1 },
      );

      try {
        // Use OpenAI service to transcribe audio
        const transcription = await openAIService.createTranscription({
          file: audioFile,
          model: "whisper-1",
          language: "pl", // Polish language
          response_format: "text",
          temperature: 0.2, // Lower temperature for more accurate transcription
        });

        console.log(
          `Successfully transcribed ${path.basename(audioPath)} on attempt ${attempts + 1}`,
        );
        audioFile.close();

        // Log successful attempt
        attemptSpan.end({
          status: "success",
          output: { length: transcription.length },
        });

        return transcription;
      } catch (attemptError) {
        attempts++;
        console.warn(
          `Transcription attempt ${attempts}/${maxAttempts} failed for ${path.basename(audioPath)}`,
        );

        // Clean up the stream
        try {
          audioFile.destroy();
        } catch (e) {
          // Ignore errors during cleanup
        }

        // Log failed attempt
        attemptSpan.end({
          status: "error",
          statusMessage:
            attemptError instanceof Error
              ? attemptError.message
              : String(attemptError),
        });

        if (attempts >= maxAttempts) {
          throw attemptError;
        }

        // Wait before retry (exponential backoff)
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * Math.pow(2, attempts)),
        );
      }
    }

    // This should never be reached due to the throw in the loop
    throw new Error("Failed to transcribe after maximum attempts");
  } catch (error) {
    console.error("Error in transcription:", error);
    throw new Error(
      `Transcription failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Analyze transcripts to identify Professor Maj's institute location
 */
async function analyzeTranscripts(
  transcripts: Transcript[],
  trace: LangfuseTraceClient,
): Promise<AnalysisResult> {
  console.log(
    "Analyzing transcripts to find Professor Maj's institute location...",
  );

  // Prepare context for analysis
  const context = transcripts
    .map(
      (t) =>
        `### Zeznania osoby: ${t.personName.toUpperCase()} ###\n${t.content}\n\n`,
    )
    .join("---\n\n");

  // System prompt for analysis - in Polish to match audio content
  const systemPrompt = `
  Jesteś ekspertem w analizie przesłuchań i specjalistą od wyciągania kluczowych informacji z zeznań świadków.

  Na podstawie transkrypcji przesłuchań świadków powinieneś ustalić:
  1. Dokładną nazwę ulicy, na której znajduje się KONKRETNY INSTYTUT uczelni, gdzie wykłada profesor Andrzej Maj.
  2. Zwróć uwagę, że pytamy o adres instytutu, a NIE adres główny uczelni.
  3. Pamiętaj, że zeznania mogą zawierać sprzeczne informacje - oceń wiarygodność każdego świadka.
  4. Zwróć szczególną uwagę na zeznania Rafała, który miał bliski kontakt z profesorem.
  5. Analizuj szczegóły takie jak: nazwa instytutu, wskazówki lokalizacyjne, punkty orientacyjne.
  6. Użyj swojej wiedzy o polskich uczelniach i instytutach naukowych aby zweryfikować informacje.

  Przeanalizuj krok po kroku wszystkie dostępne informacje, rozważ każdy trop i znajdź najbardziej wiarygodną odpowiedź.
  `;

  const userPrompt = `
  Oto transkrypcje przesłuchań świadków dotyczące profesora Andrzeja Maja i instytutu, w którym wykłada:

  ${context}

  Przeanalizuj powyższe zeznania krok po kroku i ustal, na jakiej ulicy znajduje się konkretny instytut, w którym wykłada profesor Andrzej Maj.

  Prowadź analizę metodycznie:
  1. Wynotuj wszystkie wzmianki o lokalizacji instytutu
  2. Oceń, które informacje są najbardziej wiarygodne i spójne
  3. Zidentyfikuj nazwę instytutu, jeśli jest podana
  4. Ustal dokładną nazwę ulicy, na której znajduje się ten instytut

  Przedstaw swoje rozumowanie krok po kroku, a na końcu podaj jednoznaczną odpowiedź - nazwę ulicy.
  `;

  try {
    // Create a span for the initial analysis
    const analysisSpan = langfuseService.createSpan(trace, "Initial Analysis", {
      transcriptCount: transcripts.length,
      promptTokens: systemPrompt.length + userPrompt.length,
    });

    // Use OpenAI for analysis with more tokens for reasoning
    const completion = (await openAIService.completion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      "gpt-4",
      false,
    )) as ChatCompletion;

    const analysisText = completion.choices[0].message.content || "";

    // Log the completion to Langfuse
    langfuseService.finalizeSpan(
      analysisSpan,
      "Transcript Analysis",
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      completion,
    );

    // Create a span for the extraction step
    const extractionSpan = langfuseService.createSpan(
      trace,
      "Data Extraction",
      { analysisLength: analysisText.length },
    );

    // Extract the street name using a second prompt
    const extractionPrompt = `
    Na podstawie Twojej analizy transkrypcji przesłuchań:

    ${analysisText}

    Podaj wyłącznie następujące informacje w formacie JSON:
    1. streetName - nazwa ulicy, na której znajduje się instytut profesora Maja (tylko nazwa ulicy, bez numerów)
    2. instituteName - nazwa instytutu, jeśli została ustalona
    3. confidence - poziom pewności w skali 0-100
    4. reasoning - krótkie uzasadnienie wyboru tej ulicy

    Odpowiedz w formacie JSON z tymi czterema polami. Upewnij się, że nazwa ulicy jest poprawnie zapisana.
    `;

    const completion = (await openAIService.completion(
      [
        {
          role: "system",
          content: "Wyodrębnij strukturalne dane z tekstu analizy.",
        },
        { role: "user", content: extractionPrompt },
      ],
      "gpt-4",
      false,
    )) as ChatCompletion;

    // Log the extraction completion to Langfuse
    langfuseService.finalizeSpan(
      extractionSpan,
      "JSON Extraction",
      [
        {
          role: "system",
          content: "Wyodrębnij strukturalne dane z tekstu analizy.",
        },
        { role: "user", content: extractionPrompt },
      ],
      extractionCompletion,
    );

    const jsonResponse = extractionCompletion.choices[0].message.content || "";

    try {
      // Parse the JSON response
      const result = JSON.parse(jsonResponse);
      return {
        streetName: result.streetName.trim(),
        instituteName: result.instituteName,
        confidence: result.confidence,
        reasoning: result.reasoning,
      };
    } catch (parseError) {
      console.error("Error parsing JSON response:", parseError);

      // Create a span for the fallback extraction
      const fallbackSpan = langfuseService.createSpan(
        trace,
        "Fallback Extraction",
        {
          error:
            parseError instanceof Error
              ? parseError.message
              : String(parseError),
        },
      );

      // Fallback extraction using regex
      const streetMatch = jsonResponse.match(
        /streetName["'\s]*:["'\s]*([^"',\}]+)/i,
      );
      const instituteMatch = jsonResponse.match(
        /instituteName["'\s]*:["'\s]*([^"',\}]+)/i,
      );

      const result = {
        streetName: streetMatch ? streetMatch[1].trim() : "unknown",
        instituteName: instituteMatch ? instituteMatch[1].trim() : "unknown",
        confidence: 50,
        reasoning:
          "Error extracting structured data. See full analysis output.",
      };

      fallbackSpan.end({
        status: "error",
        statusMessage: "Had to use regex fallback",
        output: JSON.stringify(result),
      });

      return result;
    }
  } catch (error) {
    console.error("Error analyzing transcripts:", error);
    throw new Error(
      `Analysis failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Submit the result to the AI Devs API
 */
async function submitResult(streetName: string): Promise<void> {
  console.log(`Submitting result: street name = ${streetName}`);

  try {
    const apiKey = process.env.PERSONAL_API_KEY;
    if (!apiKey) {
      throw new Error("API key not found in environment variables");
    }

    const response = await axios.post("https://c3ntrala.ag3nts.org/report", {
      apikey: apiKey,
      task: "mp3",
      answer: streetName,
    });

    console.log("API Response:", response.data);
  } catch (error) {
    console.error("Error submitting result:", error);
    throw error;
  }
}

// Execute if run directly
if (require.main === module) {
  findProfessorLocation()
    .then((result) => {
      console.log("Analysis complete!");
      console.log("Street name:", result.streetName);
      console.log("Institute:", result.instituteName);
      console.log("Confidence:", result.confidence + "%");
      console.log("Reasoning:", result.reasoning);
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}
