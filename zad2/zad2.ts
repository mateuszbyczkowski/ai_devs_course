import express from "express";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { OpenAIService } from "../services/OpenAIService.ts";
import axios from "axios";
import type OpenAI from "openai";
import { cleanRobotMemory, isoAnswersContextPrompt } from "../prompts.ts";

const app = express();
const port = 3003;
app.use(express.json());
app.listen(port, () =>
  console.log(
    `Server running at http://localhost:${port}. Listening for POST /api/chat requests`,
  ),
);

const openaiService = new OpenAIService();

interface RobotMessageParams {
  text: string;
  msgID: number;
}

async function answerRobotQuestions(
  isoAnswers: string[],
  previousAnswer?: RobotMessageParams,
) {
  if (!previousAnswer) {
    return await talkToRobot(<RobotMessageParams>{
      text: "READY",
      msgID: 0,
    });
  }

  const msg: ChatCompletionMessageParam[] = [
    { role: "system", content: isoAnswersContextPrompt(isoAnswers) },
    { role: "user", content: previousAnswer.text },
  ];

  const completion = (await openaiService.completion(
    msg,
    "gpt-4o",
    false,
  )) as OpenAI.Chat.Completions.ChatCompletion;

  const answer = completion.choices[0].message.content;

  if (!answer) {
    throw new Error("No content in the response");
  }

  const robotNextMsg = <RobotMessageParams>{
    text: answer,
    msgID: previousAnswer.msgID,
  };
  return await talkToRobot(robotNextMsg);
}

app.post("/api/answer", async (req, res) => {
  const robotMemoryText = await fetchData(
    "https://xyz.ag3nts.org/files/0_13_4b.txt",
  );
  const isoAnswers = await getRoboISOQuestions(robotMemoryText);

  let currentAnswer = await answerRobotQuestions(isoAnswers, undefined);
  let flgRegexp = /\{\{FLG:.*?}}/;

  while (true) {
    const robotResponse = await answerRobotQuestions(isoAnswers, currentAnswer);

    const matches = robotResponse.text.match(flgRegexp);
    if (matches) {
      return res.json(robotResponse);
    }

    currentAnswer = robotResponse; // Update the current answer for the next iteration
  }
});

async function getRoboISOQuestions(text: string) {
  console.log(text);
  const msg: ChatCompletionMessageParam[] = [
    { role: "system", content: cleanRobotMemory },
    {
      role: "user",
      content:
        "Cleanup this text, extract questions and answers and return them in an array of strings. Text: " +
        text,
    },
  ];

  const completion = (await openaiService.completion(
    msg,
    "gpt-4o",
    false,
  )) as OpenAI.Chat.Completions.ChatCompletion;

  const robotQuestions = completion.choices[0].message.content;

  if (!robotQuestions) {
    throw new Error("No content in the response");
  }
  console.log(`Robot questions: ${robotQuestions}`);

  return JSON.parse(robotQuestions) as string[];
}

async function fetchData(url: string) {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

async function talkToRobot(data: RobotMessageParams) {
  console.log("###HUMAN:", data.text);
  const resp = (
    await axios.post("https://xyz.ag3nts.org/verify", data, {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    })
  ).data as RobotMessageParams;
  console.log("###ROBOT:", resp.text);
  return resp;
}
