import { OpenAIService } from "../services/OpenAIService";
import { sendAnswerToCentrala } from "../services/CentralaAPIService";
import TurndownService from "turndown";
import { parse } from "node-html-parser";
import https from "https";

// Disable SSL verification for self-signed certificates
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";

interface Question {
  [key: string]: string;
}

interface Answer {
  [key: string]: string;
}

class SoftoAgent {
  private openai: OpenAIService;
  private turndown: TurndownService;
  private visitedUrls: Set<string> = new Set();
  private baseUrl = "https://softo.ag3nts.org";
  private maxDepth = 10;

  constructor() {
    this.openai = new OpenAIService();
    this.turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });

    // Configure turndown to preserve important elements
    this.turndown.addRule("links", {
      filter: "a",
      replacement: (content, node) => {
        const href = (node as any).getAttribute("href");
        if (!href) return content;
        return `[${content}](${href})`;
      },
    });
  }

  async fetchQuestions(): Promise<Question> {
    const apiKey = process.env.PERSONAL_API_KEY;
    const url = `https://c3ntrala.ag3nts.org/data/${apiKey}/softo.json`;

    console.log("Fetching questions from:", url);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AI Agent)",
      },
      // @ts-ignore
      agent: new https.Agent({
        rejectUnauthorized: false,
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch questions: ${response.status}`);
    }

    const questions = await response.json();
    console.log("Questions received:", questions);
    return questions;
  }

  async fetchPage(url: string): Promise<string> {
    console.log(`Fetching page: ${url}`);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AI Agent)",
      },
      // @ts-ignore
      agent: new https.Agent({
        rejectUnauthorized: false,
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch page ${url}: ${response.status}`);
    }

    const html = await response.text();
    return html;
  }

  htmlToMarkdown(html: string): string {
    // Parse HTML and clean it up
    const root = parse(html);

    // Remove script and style tags
    root.querySelectorAll("script, style").forEach((el) => el.remove());

    // Convert to markdown
    const markdown = this.turndown.turndown(root.innerHTML);

    return markdown;
  }

  extractLinks(html: string, currentUrl: string): string[] {
    const root = parse(html);
    const links: string[] = [];

    root.querySelectorAll("a").forEach((anchor) => {
      const href = anchor.getAttribute("href");
      if (href) {
        let fullUrl: string;

        if (href.startsWith("http")) {
          fullUrl = href;
        } else if (href.startsWith("/")) {
          fullUrl = this.baseUrl + href;
        } else {
          // Relative URL
          const currentBase = currentUrl.endsWith("/")
            ? currentUrl
            : currentUrl + "/";
          fullUrl = new URL(href, currentBase).href;
        }

        // Only include links to the same domain
        if (fullUrl.includes("softo.ag3nts.org")) {
          links.push(fullUrl);
        }
      }
    });

    return [...new Set(links)]; // Remove duplicates
  }

  async checkForAnswer(
    content: string,
    question: string,
  ): Promise<{ hasAnswer: boolean; answer?: string }> {
    if (content.includes("ANTY BOT PAGE")) {
      console.log("Skipping ANTY BOT PAGE");
      return new Promise((resolve) => {
        resolve({ hasAnswer: false });
      });
    }
    const prompt = `Analyze the following page content to determine if it contains the answer to this specific question:

QUESTION: ${question}

PAGE CONTENT:
${content}

Your task:
1. Carefully read the page content
2. Determine if the page contains a direct answer to the question
3. If YES, extract the EXACT answer (be very concise - just the specific information requested, no extra text)
4. If NO, respond that no answer was found

Respond in JSON format:
{
  "hasAnswer": boolean,
  "answer": "exact answer text or null"
}

IMPORTANT: For the answer field, provide ONLY the specific information requested. For example:
- If asked for an email: "contact@example.com" (NOT "The email is contact@example.com")
- If asked for a name: "John Smith" (NOT "The name is John Smith")
- If asked for a number: "42" (NOT "The answer is 42")

IMPORTANT: IF PAGE CONTAINS 'ANTY BOT PAGE' skip it.`;

    const response = await this.openai.completion(
      [{ role: "user", content: prompt }],
      "gpt-4.1-mini",
      false,
      true,
    );

    const result = response as any;
    const content_result = result.choices[0].message.content;

    try {
      const parsed = JSON.parse(content_result);
      return {
        hasAnswer: parsed.hasAnswer,
        answer: parsed.answer,
      };
    } catch (error) {
      console.error("Failed to parse LLM response:", content_result);
      return { hasAnswer: false };
    }
  }

  async selectBestLink(
    content: string,
    question: string,
    availableLinks: string[],
  ): Promise<string | null> {
    if (availableLinks.length === 0) return null;

    const prompt = `You are helping navigate a website to find the answer to a specific question.

QUESTION: ${question}

CURRENT PAGE CONTENT:
${content}

AVAILABLE LINKS:
${availableLinks.map((link, i) => `${i + 1}. ${link}`).join("\n")}

Your task is to select the ONE link that is most likely to contain the answer to the question.

Analyze the link URLs and any context from the current page to make the best choice.

Respond with just the full URL of the selected link, nothing else.

If none of the links seem relevant, respond with "NONE".`;

    const response = await this.openai.completion(
      [{ role: "user", content: prompt }],
      "gpt-4.1-mini",
    );

    const result = response as any;
    const selectedLink = result.choices[0].message.content.trim();

    if (selectedLink === "NONE") return null;

    // Validate the selected link is in our available links
    if (availableLinks.includes(selectedLink)) {
      return selectedLink;
    }

    // Try to find a partial match
    const match = availableLinks.find(
      (link) => link.includes(selectedLink) || selectedLink.includes(link),
    );
    return match || null;
  }

  async findAnswer(question: string, questionId: string): Promise<string> {
    this.visitedUrls.clear(); // Reset for each question

    console.log(
      `\n🔍 Searching for answer to question ${questionId}: ${question}`,
    );

    return await this.searchRecursively(this.baseUrl, question, 0);
  }

  async searchRecursively(
    url: string,
    question: string,
    depth: number,
  ): Promise<string> {
    if (depth >= this.maxDepth) {
      throw new Error(`Max depth reached while searching for answer`);
    }

    if (this.visitedUrls.has(url)) {
      console.log(`⏭️  Skipping already visited URL: ${url}`);
      throw new Error("Already visited this URL");
    }

    this.visitedUrls.add(url);

    console.log(`📄 Visiting (depth ${depth}): ${url}`);

    try {
      // Fetch and convert page
      const html = await this.fetchPage(url);
      const markdown = this.htmlToMarkdown(html);

      console.log(`📝 Page content length: ${markdown.length} characters`);

      // Check if this page has the answer
      const answerCheck = await this.checkForAnswer(markdown, question);

      if (answerCheck.hasAnswer && answerCheck.answer) {
        console.log(`✅ Found answer: ${answerCheck.answer}`);
        return answerCheck.answer;
      }

      console.log(`❌ No answer found on this page, looking for next link...`);

      // Extract links and select the best one
      const links = this.extractLinks(html, url);
      const unvisitedLinks = links.filter(
        (link) => !this.visitedUrls.has(link),
      );

      console.log(`🔗 Found ${unvisitedLinks.length} unvisited links`);

      if (unvisitedLinks.length === 0) {
        throw new Error("No more unvisited links to follow");
      }

      const bestLink = await this.selectBestLink(
        markdown,
        question,
        unvisitedLinks,
      );

      if (!bestLink) {
        throw new Error("No suitable link found by LLM");
      }

      console.log(`➡️  Selected link: ${bestLink}`);

      // Recursively search the selected link
      return await this.searchRecursively(bestLink, question, depth + 1);
    } catch (error) {
      console.error(`Error processing ${url}:`, error);
      throw error;
    }
  }

  async solve(): Promise<void> {
    try {
      console.log("🚀 Starting SoftoAI agent...");

      // Fetch questions
      const questions = await this.fetchQuestions();

      // Initialize answers object dynamically
      const answers: Answer = {};

      // Process each question
      for (const [questionId, question] of Object.entries(questions)) {
        try {
          const answer = await this.findAnswer(question, questionId);
          answers[questionId] = answer;
          console.log(`✅ Question ${questionId} answered: ${answer}`);
        } catch (error) {
          console.error(
            `❌ Failed to find answer for question ${questionId}:`,
            error,
          );
          throw error;
        }
      }

      console.log("\n📋 Final answers:", answers);

      // Send answers to centrala
      console.log("📤 Sending answers to centrala...");
      const result = await sendAnswerToCentrala(answers, "softo");
      console.log("🎉 Success!", result);
    } catch (error) {
      console.error("💥 Error in solve:", error);
      throw error;
    }
  }
}

// Run the agent
async function main() {
  const agent = new SoftoAgent();
  await agent.solve();
}

main().catch(console.error);
