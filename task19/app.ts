/**
 * Task 19: Drone Navigation Webhook
 *
 * API Endpoints:
 * POST /webhook - Receives drone instructions from centrala
 * POST /report - Reports webhook URL to centrala (use with Postman)
 * GET /health - Health check
 *
 * Usage with Postman:
 * 1. Start server: bun run task19
 * 2. Expose via ngrok: ngrok http 3020
 * 3. POST to /report with: {"webhookUrl": "https://your-ngrok-url.ngrok.io/webhook"}
 */
import express from "express";
import cors from "cors";
import { sendAnswerToCentrala } from "../services/CentralaAPIService";
import { OpenAIService } from "../services/OpenAIService";

const app = express();
const port = process.env.PORT || 3020;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize OpenAI service
const openaiService = new OpenAIService();

// Map description - 4x4 grid (A-D columns, 1-4 rows)
const MAP: Record<string, string> = {
  A1: "START",
  B1: "puste pole",
  C1: "drzewo",
  D1: "dom",
  A2: "puste pole",
  B2: "wiatrak",
  C2: "puste pole",
  D2: "puste pole",
  A3: "puste pole",
  B3: "puste pole",
  C3: "skały",
  D3: "dwa drzewa",
  A4: "góry",
  B4: "góry",
  C4: "samochód",
  D4: "jaskinia",
};

// OpenAI-powered drone navigation
async function parseDroneInstructions(
  instruction: string,
): Promise<{ col: string; row: number }> {
  const systemPrompt = `Jesteś systemem nawigacji drona. Analizujesz instrukcje lotu i określasz końcową pozycję drona na mapie 4x4.

MAPA 4x4:
Plansza 4 × 4 – pola z obiektami
(Kolumny A–D od lewej do prawej, wiersze 1–4 z góry w dół)

Współrzędne	Obiekt pod dronem
A1	START – znacznik lokalizacji
B1	puste pole
C1	Pojedyncze drzewo
D1	Dom z dachem i kominem
A2	puste pole
B2	Wiatrak
C2	puste pole
D2	puste pole
A3	puste pole
B3	puste pole
C3	Skały
D3	Dwa drzewa
A4	Góry
B4	Góry
C4	Samochód
D4	Jaskinia

WAŻNE ZASADY:
1. Dron ZAWSZE zaczyna w pozycji A1 (lewy górny róg)
2. Każda instrukcja to nowy lot - zawsze zaczynasz od A1
3. Kolumny: A, B, C, D (od lewej do prawej)
4. Wiersze: 1, 2, 3, 4 (z góry na dół)
5. Kierunki ruchu:
   - prawo = następna kolumna (A→B→C→D)
   - lewo = poprzednia kolumna (D→C→B→A)
   - dół = następny wiersz (1→2→3→4)
   - góra = poprzedni wiersz (4→3→2→1)
6. "na sam dół" = idź bezpośrednio do wiersza 4
7. "ile tylko możemy" = idź do maksymalnej możliwej pozycji w danym kierunku

Przeanalizuj instrukcję i określ końcową pozycję drona. Odpowiedz TYLKO w formacie JSON:
{"col": "X", "row": Y}

gdzie X to kolumna (A, B, C lub D) a Y to wiersz (1, 2, 3 lub 4).`;

  const userPrompt = `Instrukcja lotu: "${instruction}"

Przeanalizuj tę instrukcję krok po kroku:
1. Zacznij od pozycji A1
2. Wykonaj każdy ruch zgodnie z instrukcją
3. Określ końcową pozycję

Odpowiedz TYLKO w formacie JSON: {"col": "X", "row": Y}`;

  try {
    const response = await openaiService.completion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      "gpt-4.1",
      false,
      true,
    );

    if ("choices" in response && response.choices[0]?.message?.content) {
      const content = response.choices[0].message.content.trim();
      console.log("OpenAI response:", content);

      const parsed = JSON.parse(content);

      // Validate the response
      if (
        parsed.col &&
        parsed.row &&
        ["A", "B", "C", "D"].includes(parsed.col) &&
        [1, 2, 3, 4].includes(parsed.row)
      ) {
        return { col: parsed.col, row: parsed.row };
      } else {
        throw new Error("Invalid position format from OpenAI");
      }
    } else {
      throw new Error("No valid response from OpenAI");
    }
  } catch (error) {
    console.error("Error parsing drone instructions with OpenAI:", error);
    console.log(
      `Falling back to starting position for instruction: "${instruction}"`,
    );
    // Fallback to starting position
    return { col: "A", row: 1 };
  }
}

// Main webhook endpoint
app.post("/webhook", async (req, res) => {
  try {
    const { instruction } = req.body;
    console.log(`Received instruction: "${instruction}"`);

    if (!instruction || instruction.trim() === "") {
      console.log("Empty instruction, returning START");
      return res.status(200).json({ description: "START" });
    }

    // Parse the instruction to get final drone position
    const finalPosition = await parseDroneInstructions(instruction);
    const positionKey = `${finalPosition.col}${finalPosition.row}`;

    // Get description of what's at that position
    const description = MAP[positionKey] || "puste pole";
    console.log(`Final position: ${positionKey}, description: ${description}`);

    res.status(200).json({ description });
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(200).json({ description: "START" });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

// Report webhook endpoint
app.post("/report", async (req, res) => {
  try {
    const { webhookUrl } = req.body;

    if (!webhookUrl) {
      return res.status(400).json({ error: "webhookUrl is required" });
    }

    if (!webhookUrl.startsWith("https://")) {
      return res.status(400).json({ error: "Webhook URL must use HTTPS" });
    }

    console.log(`Reporting webhook URL to centrala: ${webhookUrl}`);

    // Log the message we're sending to centrala
    const payload = {
      apikey: process.env.PERSONAL_API_KEY,
      task: "webhook",
      answer: webhookUrl,
    };
    console.log(
      "Payload being sent to centrala:",
      JSON.stringify(payload, null, 2),
    );

    const result = await sendAnswerToCentrala(webhookUrl, "webhook");
    console.log("Centrala response:", JSON.stringify(result, null, 2));

    res.status(200).json({ success: true, result });
  } catch (error) {
    console.error("Error reporting webhook URL:", error);
    res.status(500).json({
      error: "Failed to report webhook URL",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Webhook server running on port ${port}`);
  console.log(`Webhook endpoint: http://localhost:${port}/webhook`);
  console.log(`Report endpoint: http://localhost:${port}/report`);
  console.log(`Use ngrok to expose: ngrok http ${port}`);
});

export default app;
