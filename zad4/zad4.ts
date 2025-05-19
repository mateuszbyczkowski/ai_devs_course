import express from "express";
import { OpenAIService } from "../services/OpenAIService.ts";
import type { ChatCompletion } from "openai/resources/chat/completions";

const app = express();
const port = 3003;
app.use(express.json());
app.listen(port, () =>
  console.log(
    `Server running at http://localhost:${port}. Listening for POST /api/chat requests`,
  ),
);

const openAIService = new OpenAIService();

const fixedMaze = [
  ["p", "X", "p", "p", "p", "p"],
  ["p", "p", "p", "X", "p", "p"],
  ["p", "X", "p", "X", "p", "p"],
  ["o", "X", "p", "p", "p", "F"],
];

function formatMaze(maze: string[][]): string {
  return maze
    .map((row) =>
      row
        .map((cell) => {
          if (cell === "p") return ".";
          if (cell === "X") return "#";
          if (cell === "o") return "S";
          if (cell === "F") return "C";
          return "?";
        })
        .join(" "),
    )
    .join("\n");
}

function buildPrompt(): string {
  return `
The robot is located in a warehouse grid. It can only move in four directions: UP, DOWN, LEFT, RIGHT.

This is the warehouse map (S = robot, C = computer, # = wall, . = empty):

${formatMaze(fixedMaze)}

Think step by step how the robot should reach the computer without hitting any wall. Then provide the output in the following JSON format:

{
  "thinking": "describe your reasoning here",
  "steps": ["UP", "RIGHT", "RIGHT", ...]
}
`;
}

app.post("/api/chat", async (req, res) => {
  try {
    const prompt = buildPrompt();

    const response = (await openAIService.completion([
      { role: "user", content: prompt },
    ])) as ChatCompletion;

    const content = response.choices[0].message.content;

    if (!content)
      return res.status(500).json({ error: "No content in response" });

    // Try to parse the JSON part from the response
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return res.json(parsed);
    }

    res.send({ raw: content, message: "Could not extract valid JSON" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  }
});
/* - Działający prompt
The robot is located in a warehouse grid. It can only move in four directions: UP, DOWN, LEFT, RIGHT.

This is the warehouse map (o = robot, F = computer, X = wall, F = empty):

    ["p", "X", "p", "p", "p", "p"],
    ["p", "p", "p", "X", "p", "p"],
    ["p", "X", "p", "X", "p", "p"],
    ["o", "X", "p", "p", "p", "F"],

Think step by step how the robot should reach the computer without hitting any wall. Then provide the output (ONLY JSON - NOTHING ELSE) in the following JSON format:
<RESULT>
{
  "thinking": "describe your reasoning here",
  "steps": "UP, RIGHT, RIGHT, ..."
}
</RESULT>
 */
