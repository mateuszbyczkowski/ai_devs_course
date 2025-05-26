import { OpenAIService } from "../services/OpenAIService";
import fs from "fs";
import path from "path";

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

  console.log(`Answering ${Object.keys(questions).length} questions...`);

  // Process each question sequentially
  for (const [id, question] of Object.entries(questions)) {
    console.log(`Question ${id}: ${question}`);

    try {
      // Generate answer using the indexed content as context
      const answer = await generateAnswer(
        question,
        indexedContent,
        openAIService,
      );
      answers[id] = answer;

      console.log(`Answer ${id}: ${answer}`);
    } catch (error) {
      console.error(`Error answering question ${id}:`, error);
      // Provide a fallback answer in case of error
      answers[id] = "Unable to generate an answer due to an error.";
    }
  }

  return answers;
}

/**
 * Generates a concise answer for a single question using the indexed content as context
 *
 * @param question - The question to answer
 * @param indexedContent - The indexed content to use as context
 * @param openAIService - OpenAI service instance
 * @returns A concise, one-sentence answer
 */
async function generateAnswer(
  question: string,
  indexedContent: string,
  openAIService: OpenAIService,
): Promise<string> {
  // Create prompt for generating the answer
  const response = await openAIService.completion(
    [
      {
        role: "system",
        content: `Jesteś asystentem, który odpowiada na pytania w oparciu o dostarczony artykuł.

        Najpierw dobrze się zastanów, a następnie odpowiedz. Zawsze odpowiadaj dodając pole _thinking,
        Rezultat zwróć w polu 'answer'.
        <rules>:
        - Odpowiadaj zawsze JEDNYM bardzo krótkim zdaniem
        - Używaj wyłącznie informacji z dostarczonego kontekstu
        - Nie pisz "według artykułu" ani podobnych fraz
        - Jeśli informacji nie ma w kontekście, zastanów się ponownie i przeanalizuj krok po kroku. Być może pominąłeś coś nieoczywistego."
        - Odpowiedź musi być zwięzła, konkretna i na temat
        - Wszystkie odpowiedzi na pytania znajdują się w kontekście! Odpowiedź 'nie wiem' to zła odpowiedź.
        - Jeżeli coś jest niejednoznaczne, zgadnij na podstawie kontekstu.
        - Pisz w języku polskim
        </rules>

        KONTEKST:
        <context>
        ${indexedContent}
        </context>

        ODPOWIEDŹ ZWRACAJ W FORMACIE JSON:
        {
        "_thinking": "Przemyślenia",
        "answer": "Odpowiedź"
        }
        `,
      },
      {
        role: "user",
        content: `PYTANIE: ${question}`,
      },
    ],
    "gpt-4.1-mini",
  );

  const answer = (response as any).choices[0].message.content;

  console.log("test");
  console.log(answer);

  return JSON.parse(answer).answer;
}

export { answerQuestions };
