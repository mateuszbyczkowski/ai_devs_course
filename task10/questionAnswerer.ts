import { OpenAIService } from "../services/OpenAIService";
import fs from "fs";
import path from "path";

interface QuestionAnswer {
  id: string;
  _thinking: string;
  answer: string;
}

/**
 * Answer questions based on the indexed content
 * Returns concise, one-sentence answers for each question
 *
 * @param questions - Object with question IDs as keys and question text as values
 * @param indexedContent - Processed article content in markdown format
 * @param openAIService - Instance of OpenAIService to use for question answering
 * @returns Object with question IDs as keys and answers as values
 */
async function answerQuestions(
  questions: Record<string, string>,
  indexedContent: string,
  openAIService: OpenAIService,
): Promise<Record<string, string>> {
  const answers: Record<string, string> = {};

  console.log(
    `Answering ${Object.keys(questions).length} questions in batch...`,
  );

  try {
    // Generate answers for all questions in a single request
    const batchAnswers = await generateBatchAnswers(
      questions,
      indexedContent,
      openAIService,
    );

    // Map answers back to their IDs
    for (const [id, answer] of Object.entries(batchAnswers)) {
      answers[id] = answer;
      console.log(`Answer ${id}: ${answer}`);
    }
  } catch (error) {
    console.error(`Error answering questions in batch:`, error);
    // Provide fallback answers in case of error
    for (const id of Object.keys(questions)) {
      answers[id] = "Unable to generate an answer due to an error.";
    }
  }

  return answers;
}

/**
 * Generates concise answers for multiple questions in a single batch request
 *
 * @param questions - Object with question IDs as keys and question text as values
 * @param indexedContent - The indexed content to use as context
 * @param openAIService - OpenAI service instance
 * @returns Object with question IDs as keys and answer strings as values
 */
async function generateBatchAnswers(
  questions: Record<string, string>,
  indexedContent: string,
  openAIService: OpenAIService,
): Promise<Record<string, string>> {
  // Format questions for the prompt
  const questionsList = Object.entries(questions)
    .map(([id, question]) => `${id}: ${question}`)
    .join("\n");

  // Create prompt for generating all answers in one request
  const response = await openAIService.completion(
    [
      {
        role: "system",
        content: `Jesteś asystentem, który odpowiada na pytania w oparciu o dostarczony artykuł.

        Najpierw dobrze się zastanów, a następnie odpowiedz na WSZYSTKIE podane pytania.
        Dla każdego pytania przeprowadź wnioskowanie w polu _thinking i na jego podstawie podaj odpowiedź.
        Znalezione nazwy własne miejsc i obiektów potraktuj poważnie i postaraj się odpowiedzieć po wcześniejszym zrozumieniu czym są.
        Finalną odpowiedź na każde pytanie zwróć w polu 'answer'.

        <rules>:
        - Odpowiadaj zawsze JEDNYM bardzo krótkim zdaniem
        - Używaj wyłącznie informacji z dostarczonego kontekstu
        - Nie pisz "według artykułu" ani podobnych dodatkowych fraz
        - Jeśli informacji nie ma w kontekście, zastanów się ponownie i przeanalizuj krok po kroku. Być może pominąłeś coś nieoczywistego
        - Odpowiedź musi być zwięzła, konkretna i na temat
        - Wszystkie odpowiedzi na pytania znajdują się w kontekście! Odpowiedź 'nie wiem' to zła odpowiedź
        - Jeżeli coś jest niejednoznaczne, zgadnij na podstawie CAŁEGO kontekstu.
        - Pisz w języku polskim
        </rules>

        KONTEKST:
        <context>
        ${indexedContent}
        </context>

        ZWRÓĆ ODPOWIEDZI W FORMACIE JSON - TABLICA OBIEKTÓW Z ID PYTANIA I ODPOWIEDZIĄ:
        "answers": {[
          {
            "id": "01",
            "_thinking": "Szczegółowe przemyślenia na temat pytania 01",
            "answer": "Krótka, zwięzła odpowiedź na pytanie 01"
          },
          {
            "id": "02",
            "_thinking": "Szczegółowe przemyślenia na temat pytania 02",
            "answer": "Krótka, zwięzła odpowiedź na pytanie 02"
          },
          ...
        ],
        }

        Musisz odpowiedzieć na WSZYSTKIE podane pytania. Ściśle trzymaj się formatu odpowiedzi!
        `,
      },
      {
        role: "user",
        content: `PYTANIA:\n${questionsList}`,
      },
    ],
    "gpt-4.1",
    false,
    true,
  );

  const content = (response as any).choices[0].message.content;
  let parsedAnswers: QuestionAnswer[];

  console.log(content);
  try {
    parsedAnswers = JSON.parse(content).answers;
  } catch (error) {
    console.error("Failed to parse JSON response:", content);
    throw new Error("Invalid JSON response from the model");
  }

  // Convert array of answer objects to record format
  const answers: Record<string, string> = {};
  for (const item of parsedAnswers) {
    answers[item.id] = item.answer;
    console.log(`Question ${item.id} reasoning: ${item._thinking}`);
  }

  return answers;
}

export { answerQuestions };
