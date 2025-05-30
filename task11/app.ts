import fs from "fs";
import path from "path";
import { OpenAIService } from "../services/OpenAIService";
import { LangfuseService } from "../services/LangfuseService";
import { v4 as uuidv4 } from "uuid";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { sendAnswerToCentrala } from "../services/CentralaAPIService";

// Define paths
const baseDir = path.join(__dirname, "pliki_z_fabryki");
const factsDir = path.join(baseDir, "facts");

// Initialize services
const openai = new OpenAIService();
const langfuseService = new LangfuseService();

export interface KeywordMap {
  [filename: string]: string[];
}

async function analyzeReports() {
  try {
    // Read all files from both directories
    const reportFiles = fs
      .readdirSync(baseDir)
      .filter((file) => file.endsWith(".txt") && file.includes("report"));

    const factFiles = fs
      .readdirSync(factsDir)
      .filter((file) => file.endsWith(".txt"));

    // Read facts content
    const facts = factFiles.map((ff) =>
      fs.readFileSync(path.join(factsDir, ff), "utf-8"),
    );

    // Process each report
    const keywordMap: KeywordMap = {};

    for (const reportFile of reportFiles) {
      console.log(`Processing report: ${reportFile}`);
      const reportPath = path.join(baseDir, reportFile);
      const reportContent = fs.readFileSync(reportPath, "utf-8");

      // Extract metadata from filename
      const metadata = parseReportFilename(reportFile);

      // Generate keywords
      const keywords = await generateKeywords(reportContent, facts, metadata);

      // Store in map
      keywordMap[reportFile] = keywords;

      console.log(`Keywords for ${reportFile}: ${keywords.join(", ")}`);
    }

    console.log("Analysis complete. Keyword map:");
    console.log(JSON.stringify(keywordMap, null, 2));

    return keywordMap;
  } catch (error) {
    console.error("Error analyzing reports:", error);
    throw error;
  }
}

function parseReportFilename(filename: string): {
  date: string;
  reportNumber: string;
  sector?: string;
} {
  // Example: 2024-11-12_report-00-sektor_C4.txt
  const parts = filename.split("_");
  const date = parts[0];

  const reportPart = parts[1]?.split("-") || [];
  const reportNumber = reportPart[1] || "";

  const sectorMatch = filename.match(/sektor[_-]([A-Z][0-9])/i);
  const sector = sectorMatch ? sectorMatch[1] : undefined;

  return { date, reportNumber, sector };
}

async function generateKeywords(
  reportContent: string,
  facts: string[],
  metadata: { date: string; reportNumber: string; sector?: string },
): Promise<string[]> {
  // Create a unique trace ID for this request
  const conversation_id = uuidv4();

  // Create a trace in Langfuse
  const trace = langfuseService.createTrace({
    id: uuidv4(),
    name: "Generate Keywords",
    sessionId: conversation_id,
  });

  const prompt = `
    <facts>
     ${facts.join("\n\n")}
    </facts>

    <report>
      ${reportContent}
   </report>

   <report_metadata>
    METADANE RAPORTU:
    Data: ${metadata.date}
    Numer raportu: ${metadata.reportNumber}
    Sektor: ${metadata.sector || "Nie określono"}
   </report_metadata>

    <objective>
      Na podstawie raportu, jego metadanych oraz powiązanych faktów, wygeneruj listę słów kluczowych w języku polskim, które dokładnie opisują raport.
      Postaraj się żeby lista słów kluczowych była wyczerpująca, zwróć uwage na nazwy własne ludzi, miejsc i technologii.
    </objective>

    <rules>
      - Słowa kluczowe MUSZĄ być w języku polskim.
      - Jeśli w raporcie pojawia się osoba, a w "faktach" znajdują się informacje o tej osobie lub inne istotne szczegóły, MUSZĄ one trafić do słów kluczowych dla tego raportu.
      - Słowa kluczowe MUSZĄ być w mianowniku (np. "nauczyciel", "programista", a NIE "nauczycielom", "programisty").
      - W "faktach" mogą występować drobne różnice w pisowni nazwisk (np. "Kowaski" i "Kowalki"). Spróbuj poprawnie zaklasyfikować literówki, aby uzyskać bardziej spójne słowa kluczowe.
      - Uwzględnij informacje o: co się wydarzyło, gdzie, kto był zaangażowany, kim był zaangażowany, jakie przedmioty lub technologie się pojawiły.
      - Nie używaj słów w liczbie mnogiej, chyba że to konieczne.
      - Nie używaj fraz, tylko POJEDYNCZE słowa.
      - Nie podawaj wyjaśnień, tylko listę słów.
    </rules>

    <format>
      Zwróć odpowiedź jako obiekt JSON z dwoma polami.
      "_thinking" oraz "keywords"
      {
       "_thinking": "Analysis of existing keywords and identification of missing ones",
       "keywords": ["słowo1", "słowo2", "słowo3"]
      }
    </format>
    `;

  try {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content:
          "Jesteś ekspertem językoznawcą i analitykiem raportów specjalizującym się w języku polskim i ekstrakcji słów kluczowych.",
      },
      { role: "user", content: prompt },
    ];

    // Create a span for the completion
    const keywordsSpan = langfuseService.createSpan(
      trace,
      "Keywords Extraction",
      "Extracting keywords from report",
    );

    const response = await openai.completion(messages, "gpt-4.1", false);

    // Ensure response is of type ChatCompletion
    if (Symbol.asyncIterator in response) {
      throw new Error(
        "Expected non-streaming response but got streaming response",
      );
    }

    // Finalize the span with input and output
    langfuseService.finalizeSpan(
      keywordsSpan,
      "Keywords Extraction",
      messages,
      response,
    );

    if ("choices" in response && response.choices[0]?.message?.content) {
      const content = response.choices[0].message.content;
      let extractedKeywords: string[] = [];

      try {
        // Try to parse as JSON first
        const result = JSON.parse(content);
        if (result && result.keywords && Array.isArray(result.keywords)) {
          extractedKeywords = result.keywords;
        } else if (Array.isArray(result)) {
          extractedKeywords = result;
        } else {
          // If not valid JSON, try to extract array-like content
          const arrayMatch = content.match(/\[(.*)\]/s);
          if (arrayMatch && arrayMatch[1]) {
            extractedKeywords = arrayMatch[1]
              .split(",")
              .map((item) => item.trim().replace(/^["']|["']$/g, ""))
              .filter(Boolean);
          }
        }

        // Finalize the trace with the extracted keywords
        await langfuseService.finalizeTrace(trace, messages, [
          JSON.stringify(extractedKeywords),
        ]);

        return extractedKeywords;
      } catch (e) {
        console.error("Failed to parse keywords response:", e);
        // Try to extract array-like content if JSON parsing failed
        const arrayMatch = content.match(/\[(.*)\]/s);
        if (arrayMatch && arrayMatch[1]) {
          extractedKeywords = arrayMatch[1]
            .split(",")
            .map((item) => item.trim().replace(/^["']|["']$/g, ""))
            .filter(Boolean);
          // Finalize the trace with the extracted keywords
          await langfuseService.finalizeTrace(trace, messages, [
            JSON.stringify(extractedKeywords),
          ]);

          return extractedKeywords;
        }
        return [];
      }
    }
    return [];
  } catch (error) {
    console.error("Error generating keywords:", error);
    // Record error in Langfuse
    trace.update({
      input: JSON.stringify({ error: String(error) }),
      output: "error",
    });
    await langfuseService.finalizeTrace(
      trace,
      [],
      ["Error generating keywords"],
    );
    return [];
  }
}

// Execute the analysis function
analyzeReports()
  .then((keywordMap) => {
    // Here you can export the keywordMap for further processing
    fs.writeFileSync(
      path.join(__dirname, "keywords_result.json"),
      JSON.stringify(keywordMap, null, 2),
    );
    console.log("Results saved to keywords_result.json");

    const answer: Record<string, string> = {};

    // Process each file entry
    for (const [filename, keywords] of Object.entries(keywordMap)) {
      const keywordsArray = Array.isArray(keywords) ? keywords : [];

      // Join keywords with commas
      answer[filename] = keywordsArray.join(",");
    }
    sendAnswerToCentrala(answer, "dokumenty");

    // Flush any remaining Langfuse events before exiting
    return langfuseService.langfuse.shutdownAsync();
  })
  .catch((err) => {
    console.error("Failed to analyze reports:", err);
    process.exit(1);
  });
