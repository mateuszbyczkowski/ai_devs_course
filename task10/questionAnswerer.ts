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
  // Optimize context for relevance to reduce token usage
  const relevantContext = extractRelevantContext(question, indexedContent);

  // Create prompt for generating the answer
  const response = await openAIService.completion(
    [
      {
        role: "system",
        content: `Jesteś asystentem, który odpowiada na pytania w oparciu o dostarczony artykuł.

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
        ${relevantContext}
        </context>
        `,
      },
      {
        role: "user",
        content: `PYTANIE: ${question}`,
      },
    ],
    "gpt-4.1",
  );

  const answer = (response as any).choices[0].message.content.trim();

  // Clean up the answer - remove quotation marks and ensure it's a single sentence
  return cleanAnswer(answer);
}

/**
 * Cleans the answer to ensure it's concise and properly formatted
 *
 * @param answer - The raw answer from the model
 * @returns A cleaned, single-sentence answer
 */
function cleanAnswer(answer: string): string {
  // Remove quotation marks that might be present
  let cleanedAnswer = answer.replace(/^["'](.*)["']$/, "$1");

  // Normalize whitespace
  cleanedAnswer = cleanedAnswer.replace(/\s+/g, " ").trim();

  // Split by common sentence terminators to get the first sentence
  const sentenceTerminators = [".", "!", "?"];
  for (const terminator of sentenceTerminators) {
    if (cleanedAnswer.includes(terminator)) {
      const parts = cleanedAnswer.split(terminator);
      // Get the first non-empty sentence and add the terminator back
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.length > 0) {
          cleanedAnswer = `${trimmed}${terminator}`;
          break;
        }
      }
      break;
    }
  }

  // If the answer doesn't end with punctuation, add a period
  if (!sentenceTerminators.some((term) => cleanedAnswer.endsWith(term))) {
    cleanedAnswer += ".";
  }

  return cleanedAnswer;
}

/**
 * Extracts content sections from the indexed content relevant to the question
 * to reduce context size while preserving important information
 */
function extractRelevantContext(
  question: string,
  indexedContent: string,
): string {
  // If the content is relatively small, return it as is
  if (indexedContent.length < 30000) {
    return indexedContent;
  }

  // Convert question to lowercase for case-insensitive matching
  const lowerQuestion = question.toLowerCase();

  // Create a list of important keywords from the question
  // Remove common Polish words and characters that aren't useful for searching
  const stopWords = [
    "w",
    "i",
    "na",
    "z",
    "do",
    "o",
    "jak",
    "czy",
    "kto",
    "kiedy",
    "gdzie",
    "co",
    "dlaczego",
    "jakie",
    "przez",
  ];
  const keywords = lowerQuestion
    .replace(/[.,?!;:()]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.includes(word));

  // Split the content into sections (by headers)
  const sections = indexedContent.split(/#{1,6} /);

  // Score each section based on keyword matches
  const scoredSections = sections.map((section) => {
    const lowerSection = section.toLowerCase();
    let score = 0;

    // Add points for each keyword found in the section
    for (const keyword of keywords) {
      const matches = lowerSection.match(new RegExp(keyword, "g"));
      if (matches) {
        score += matches.length;
      }
    }

    return { section, score };
  });

  // Sort sections by score in descending order
  scoredSections.sort((a, b) => b.score - a.score);

  // Take the top 3 relevant sections, or more if needed
  let relevantContent = scoredSections
    .slice(0, Math.min(5, Math.max(3, Math.ceil(scoredSections.length / 3))))
    .map((item) => item.section)
    .join("\n\n");

  // If no good matches found, fallback to returning intro + conclusion
  if (relevantContent.length < 1000) {
    const startSection = indexedContent.substring(0, 3000);
    const endSection = indexedContent.substring(indexedContent.length - 3000);
    relevantContent = startSection + "\n\n...\n\n" + endSection;
  }

  return relevantContent;
}

export { answerQuestions };
