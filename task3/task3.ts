import express from "express";
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

import { OpenAIService } from "../services/OpenAIService.ts";
import { v4 as uuidv4 } from "uuid";
import { LangfuseService } from "../services/LangfuseService.ts";

const app = express();
const port = 3000;
app.use(express.json());
app.listen(port, () =>
  console.log(
    `Server running at http://localhost:${port}. Listening for POST /api/chat requests`,
  ),
);

const openaiService = new OpenAIService();
const langfuseService = new LangfuseService();

interface RiddleParams {
  question: string;
  answer: number;
  test?: {
    q: string;
    a: string;
  };
}

const PERSONAL_API_KEY = process.env.PERSONAL_API_KEY;

app.post("/api/chat", async (req, res) => {
  const conversation_id = uuidv4();

  const trace = langfuseService.createTrace({
    id: uuidv4(),
    name: "Answering questions",
    sessionId: conversation_id,
  });

  const fetchedData = await fetchData(
    `${process.env.CENTRALA}/data/${PERSONAL_API_KEY}/json.txt`,
  );

  fetchedData.apikey = PERSONAL_API_KEY;

  const generatedMessages = [];
  for (const riddle of fetchedData["test-data"] as RiddleParams[]) {
    if (riddle.test) {
      // use LLM to answer test
      const msg: ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: `Answer my questions use only english language and only english letters. Answer as short as possible, but be precise. Do not use any other language or letters. Answer only with the answer, do not add anything else. If you can use just one word.`,
        },
        { role: "user", content: `Answer the question: ${riddle.test.q}` },
      ];

      const mainSpan = langfuseService.createSpan(
        trace,
        "Main Completion",
        "No messages",
      );
      const completion = (await openaiService.completion(
        msg,
        "gpt-4o",
        false,
      )) as ChatCompletion;
      langfuseService.finalizeSpan(
        mainSpan,
        "Main Completion",
        msg,
        completion,
      );

      const answer = completion.choices[0].message.content;

      if (!answer) {
        throw new Error("No content in the response");
      }
      console.log(answer);
      generatedMessages.push(answer);
      riddle.test.a = answer;
    }
    const elements = riddle.question.split(" ");

    if (elements[1] === "+") {
      riddle.answer = Number(elements[0]) + Number(elements[2]);
    } else if (elements[1] === "-") {
      riddle.answer = Number(elements[0]) - Number(elements[2]);
    } else if (elements[1] === "*") {
      riddle.answer = Number(elements[0]) * Number(elements[2]);
    } else if (elements[1] === "/") {
      riddle.answer = Number(elements[0]) / Number(elements[2]);
    }
  }

  await langfuseService.finalizeTrace(trace, [], generatedMessages);

  const fixedResponse = {
    task: "JSON",
    apikey: PERSONAL_API_KEY,
    answer: fetchedData,
  };

  const flag = await getFlag(fixedResponse);

  let flgRegexp = /\{\{FLG:.*?}}/;
  const matches = flag.message.match(flgRegexp);
  if (matches) {
    return res.json(flag);
  } else {
    return res
      .status(500)
      .json({ error: "Failed to find the flag in the response" });
  }
});

async function fetchData(url: string) {
  try {
    const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }
    return await response.json();
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

async function getFlag(data: Object) {
  const response = await fetch(`${process.env.CENTRALA}/report`, {
    method: 'POST',
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const resp = await response.json();
  console.log(resp);
  return resp;
}
