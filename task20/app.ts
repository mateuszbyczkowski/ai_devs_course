import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
//@ts-ignore
import pdf from "pdf-parse-debugging-disabled";
import { OpenAIService } from "../services/OpenAIService";
import { sendAnswerToCentrala } from "../services/CentralaAPIService";

const execAsync = promisify(exec);

// Configuration
const CONFIG = {
  MAX_RETRIES: 10,
  PDF_FILENAME: "notatnik-rafala.pdf",
  PAGE_19_INDEX: 18, // Zero-based index for page 19
  IMAGES_DIR: "images",
  OUTPUT_IMAGE: "page19.png",
  VISION_MODELS: ["gpt-4.1"],
  VISION_PROMPTS: [
    "Przepisz dokładnie CAŁY tekst napisany odręcznie na tym obrazku, słowo po słowie:",
    "Transcribe ALL handwritten text visible in this Polish document image, word by word:",
    "Odczytaj i przepisz każde słowo napisane odręcznie na tym dokumencie:",
  ],
} as const;

// Detect ImageMagick command
async function detectImageMagickCommand(): Promise<string> {
  const commands = ["magick", "convert"];

  for (const cmd of commands) {
    try {
      await execAsync(`which ${cmd}`);
      return cmd;
    } catch {
      continue;
    }
  }

  throw new Error("ImageMagick not found. Please install ImageMagick.");
}

interface Question {
  [key: string]: string;
}

interface Answer {
  [key: string]: string;
}

interface Feedback {
  question: string;
  wrongAnswer: string;
  hint: string;
}

class NotebookAnalyzer {
  private openaiService: OpenAIService;
  private centralaUrl: string;
  private apiKey: string;
  private notebookText: string = "";
  private questions: Question = {};
  private answers: Answer = {};
  private feedbackHistory: { [key: string]: Feedback[] } = {};

  constructor() {
    this.openaiService = new OpenAIService();
    this.centralaUrl = process.env.CENTRALA!;
    this.apiKey = process.env.PERSONAL_API_KEY!;

    if (!this.centralaUrl || !this.apiKey) {
      throw new Error(
        "Missing required environment variables: CENTRALA or PERSONAL_API_KEY",
      );
    }
  }

  private async downloadFile(url: string, filename: string): Promise<void> {
    const filePath = path.join(__dirname, filename);

    if (fs.existsSync(filePath)) {
      console.log(`${filename} already exists`);
      return;
    }

    console.log(`Downloading ${filename}...`);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download ${filename}: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filePath, new Uint8Array(buffer));
    console.log(`Downloaded ${filename}`);
  }

  private async downloadQuestions(): Promise<void> {
    const questionsUrl = `${this.centralaUrl}/data/${this.apiKey}/notes.json`;
    const response = await fetch(questionsUrl);

    if (!response.ok) {
      throw new Error(`Failed to download questions: ${response.statusText}`);
    }

    this.questions = await response.json();
    console.log("Questions downloaded");
  }

  private async extractTextFromPdf(): Promise<void> {
    const pdfPath = path.join(__dirname, CONFIG.PDF_FILENAME);
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);

    this.notebookText = data.text;
    console.log(`Extracted ${data.text.length} characters from PDF`);
  }

  private async extractImageFromPage19(): Promise<string> {
    const outputDir = path.join(__dirname, CONFIG.IMAGES_DIR);
    const outputPath = path.join(outputDir, CONFIG.OUTPUT_IMAGE);

    if (fs.existsSync(outputPath)) {
      console.log("Page 19 image already exists");
      return outputPath;
    }

    console.log("Extracting image from page 19...");

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const pdfPath = path.join(__dirname, CONFIG.PDF_FILENAME);
    const magickCmd = await detectImageMagickCommand();
    const convertArgs = magickCmd === "magick" ? "convert" : "";
    const command =
      `${magickCmd} ${convertArgs} -density 300 -colorspace Gray -normalize "${pdfPath}[${CONFIG.PAGE_19_INDEX}]" -quality 85 -resize 1600x "${outputPath}"`.trim();

    try {
      await execAsync(command);

      if (!fs.existsSync(outputPath)) {
        throw new Error("Image extraction failed - file not created");
      }

      console.log("Page 19 image extracted");
      return outputPath;
    } catch (error) {
      throw new Error(`Failed to extract page 19 image: ${error}`);
    }
  }

  private async analyzeImageWithVision(imagePath: string): Promise<string> {
    console.log("Analyzing page 19 with Vision...");

    for (const model of CONFIG.VISION_MODELS) {
      for (const prompt of CONFIG.VISION_PROMPTS) {
        try {
          return await this.openaiService.analyzeImage({
            imagePath,
            prompt,
            model,
            maxTokens: 4000,
          });
        } catch (error) {
          console.log(`❌ Model ${model} failed: ${(error as Error).message}`);
          continue;
        }
      }
    }

    throw new Error("All vision analysis attempts failed");
  }

  private async prepareFullContext(): Promise<void> {
    console.log("Preparing notebook context...");

    await this.extractTextFromPdf();
    const imagePath = await this.extractImageFromPage19();
    const page19Text = await this.analyzeImageWithVision(imagePath);

    this.notebookText += "\n\n=== STRONA 19 (Z VISION) ===\n" + page19Text;
    console.log(`Total text length: ${this.notebookText.length} characters`);
  }

  private buildFeedbackContext(questionId: string): string {
    const feedback = this.feedbackHistory[questionId];
    if (!feedback || feedback.length === 0) {
      return "";
    }

    let context = "\n\nWCZEŚNIEJSZE BŁĘDNE ODPOWIEDZI I WSKAZÓWKI:\n";
    feedback.forEach((item, index) => {
      context += `Próba ${index + 1}: Błędna odpowiedź: "${item.wrongAnswer}", Wskazówka: "${item.hint}"\n`;
    });
    context +=
      "\nKRYTYCZNE: NIE używaj żadnej z wcześniej odrzuconych odpowiedzi!\n";

    return context;
  }

  private getSpecificInstructions(questionId: string): string {
    if (questionId === "05") {
      return `
SPECJALNA INSTRUKCJA DLA PYTANIA 05:
- Tekst ze strony 19 może zawierać błędy OCR
- Szukaj nazwy miejscowości niedaleko GRUDZIĄDZA
- Pomyśl o błędach OCR: "p -> b", "n -> w", "w -> n" i innych`;
    }
    return "";
  }

  private async answerQuestion(
    questionId: string,
    question: string,
  ): Promise<string> {
    console.log(`Answering question ${questionId}: ${question}`);

    const feedbackContext = this.buildFeedbackContext(questionId);
    const specificInstructions = this.getSpecificInstructions(questionId);

    const prompt = `Jesteś ekspertem analizującym notatnik Rafała. Na podstawie pełnej treści notatnika odpowiedz na pytanie.

TREŚĆ NOTATNIKA:
${this.notebookText}

${feedbackContext}

PYTANIE ${questionId}: ${question}

${specificInstructions}

INSTRUKCJE:
- Odpowiedz BARDZO zwięźle, maksymalnie kilka słów
- Jeśli pytanie dotyczy daty, odpowiedz w formacie YYYY-MM-DD
- Nie dodawaj wyjaśnień ani dodatkowych szczegółów
- NIE UŻYWAJ wcześniej odrzuconych odpowiedzi!
- Dla pytania 01: szukaj konkretny rok - uwzględnij wszystkie fakty i wydarzenia z tekstu
- Dla pytania 02: podaj tylko imię osoby
- Dla pytania 03: Iz 2:19 to odniesienie biblijne - opisz miejsce schronienia
- Dla pytania 04: "To już jutro" w dniu "11 listopada 2024" oznacza 12 listopada
- Dla pytania 05: odpowiedz TYLKO nazwa miejscowości!

ODPOWIEDŹ (tylko konkretna informacja, bez wyjaśnień):`;

    const messages = [{ role: "user" as const, content: prompt }];
    const response = await this.openaiService.completion(messages, "gpt-4.1");

    if ("choices" in response && response.choices?.[0]?.message?.content) {
      const answer = response.choices[0].message.content.trim();
      console.log(`Answer for ${questionId}: ${answer}`);
      return answer;
    }

    throw new Error(`Failed to get answer for question ${questionId}`);
  }

  private async answerAllQuestions(): Promise<void> {
    console.log("Answering all questions...");

    for (const [questionId, question] of Object.entries(this.questions)) {
      this.answers[questionId] = await this.answerQuestion(
        questionId,
        question,
      );
    }

    console.log("All answers prepared");
  }

  private addFeedback(
    questionId: string,
    wrongAnswer: string,
    hint: string,
  ): void {
    if (!this.feedbackHistory[questionId]) {
      this.feedbackHistory[questionId] = [];
    }

    this.feedbackHistory[questionId].push({
      question: this.questions[questionId],
      wrongAnswer,
      hint,
    });

    console.log(`Added feedback for question ${questionId}`);
  }

  private async processFeedback(feedbackData: any): Promise<void> {
    console.log("Processing feedback...");

    if (feedbackData?.hint && feedbackData?.message) {
      const questionMatch = feedbackData.message.match(/question (\d+)/);

      if (questionMatch) {
        const questionId = questionMatch[1].padStart(2, "0");
        const wrongAnswer = this.answers[questionId];

        this.addFeedback(questionId, wrongAnswer, feedbackData.hint);
        this.answers[questionId] = await this.answerQuestion(
          questionId,
          this.questions[questionId],
        );
      } else {
        console.log("Could not parse specific question, re-answering all...");
        await this.answerAllQuestions();
      }
    }
  }

  private async submitAnswers(): Promise<any> {
    console.log("Submitting answers...");
    const response = await sendAnswerToCentrala(this.answers, "notes");
    console.log("Response received");
    return response;
  }

  async run(): Promise<void> {
    try {
      console.log("Starting notebook analysis...");

      // Download required files
      await this.downloadFile(
        `${this.centralaUrl}/dane/${CONFIG.PDF_FILENAME}`,
        CONFIG.PDF_FILENAME,
      );
      await this.downloadQuestions();

      // Prepare analysis context
      await this.prepareFullContext();

      // Answer questions with retry mechanism
      await this.answerAllQuestions();

      let retryCount = 0;

      while (retryCount <= CONFIG.MAX_RETRIES) {
        try {
          const response = await this.submitAnswers();

          if (response?.code === 0) {
            console.log("✅ Task completed successfully!");
            return;
          }
        } catch (error: any) {
          if (retryCount >= CONFIG.MAX_RETRIES) {
            console.log("❌ Task failed after all retries");
            throw error;
          }

          console.log(
            `Attempt ${retryCount + 1} failed. Processing feedback...`,
          );

          // Extract feedback from error message
          let feedbackData = null;
          if (error.message?.includes("Response:")) {
            try {
              const responseMatch = error.message.match(/Response: (.+)$/);
              if (responseMatch) {
                feedbackData = JSON.parse(responseMatch[1]);
              }
            } catch (parseError) {
              console.log("Could not parse feedback from error");
            }
          }

          if (feedbackData) {
            await this.processFeedback(feedbackData);
          }
        }

        retryCount++;
      }

      console.log("❌ Task failed after all retries");
    } catch (error) {
      console.error("Error in notebook analysis:", error);
      throw error;
    }
  }
}

// Run the analyzer
const analyzer = new NotebookAnalyzer();
analyzer.run().catch(console.error);
