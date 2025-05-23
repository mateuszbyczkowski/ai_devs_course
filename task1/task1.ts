import express from "express";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { OpenAIService } from "../services/OpenAIService.ts";
import axios from "axios";
import type OpenAI from "openai";
import { useShortAnswerPrompt } from "../prompts.ts";

const app = express();
const port = 3003;
app.use(express.json());
app.listen(port, () =>
  console.log(
    `Server running at http://localhost:${port}. Listening for POST /api/chat requests`,
  ),
);

const openaiService = new OpenAIService();

app.post("/api/answer", async (req, res) => {
  const html = await fetchData("https://xyz.ag3nts.org/");

  const prompt = "Answer this question: " + getCaptchaQuestion(html);

  const msg: ChatCompletionMessageParam[] = [
    { role: "system", content: useShortAnswerPrompt },
    { role: "user", content: prompt },
  ];

  const completion = (await openaiService.completion(
    msg,
    "gpt-4o",
    false,
  )) as OpenAI.Chat.Completions.ChatCompletion;

  if (!completion.choices[0].message.content) {
    throw new Error("No content in the response");
  }

  const formData = new URLSearchParams({
    username: "tester",
    password: "574e112a",
    answer: completion.choices[0].message.content,
  });

  const formResponse = await postData(formData);

  if (formResponse.status !== 200) {
    return res.status(500).json({ error: "Failed to submit the answer" });
  }

  const flgRegexp = /\{\{FLG:.*?}}/;

  const matches = formResponse.data.match(flgRegexp);
  console.log(formResponse);
  if (matches) {
    return res.json(formResponse);
  } else {
    return res
      .status(500)
      .json({ error: "Failed to find the flag in the response" });
  }
});

function getCaptchaQuestion(html: string) {
  const regex = /<p id="human-question">.*?Question:<br\s*\/>(.*?)<\/p>/i;
  const match = html.match(regex);

  if (match) {
    const question = match[1].trim();
    console.log(question); // Output: "Rok założenia Facebooka?"
    return question;
  }
  throw new Error("Question not found in the HTML content");
}

async function fetchData(url: string) {
  try {
    const response = await axios.get(url);
    console.log(response.data);
    return response.data;
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

async function postData(data: URLSearchParams) {
  return await axios.post("https://xyz.ag3nts.org/", data.toString(), {
    headers: {
      accept: "text/html",
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
}
