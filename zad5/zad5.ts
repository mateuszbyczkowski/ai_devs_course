import type {
  ChatCompletion,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

import axios from "axios";
import { anonymizeDataPrompt } from "../prompts.ts";
import { OpenAIService } from "../services/OpenAIService.ts";
import { LocalOllamaService } from "../services/LocalOllamaService.ts";
import { LocalLlamaCppService } from "../services/LocalLlamaCppService.ts";
import type { Request } from "express-serve-static-core";
import type { ParsedQs } from "qs";

const openaiService = new OpenAIService();

async function submitData(anonymizedData: string) {
  const response = {
    task: "CENZURA",
    apikey: process.env.PERSONAL_API_KEY,
    answer: anonymizedData,
  };

  const resp = (
    await axios.post("https://c3ntrala.ag3nts.org/report", response, {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    })
  ).data;
  return resp;
}

export async function zad5(req: any) {
  const realData = await fetchData(
    `https://c3ntrala.ag3nts.org/data/${process.env.PERSONAL_API_KEY}/cenzura.txt`,
  );

  console.log("REAL DATA: " + realData);

  const anonymizedData = await anonymizeData(realData);

  console.log("ANONYMIZED DATA: " + anonymizedData);

  let answer = await submitData(anonymizedData);

  console.log(answer);

  let flgRegexp = /\{\{FLG:.*?}}/;

  const matches = answer.message.match(flgRegexp);

  if (matches) {
    return answer;
  } else {
    return "error";
  }
}

async function anonymizeData(text: string) {
  const msg: ChatCompletionMessageParam[] = [
    { role: "system", content: anonymizeDataPrompt },
    {
      role: "user",
      content: "Anonymize this text: " + text,
    },
  ];

  // const completion = (await openaiService.completion(msg, "gpt-4o", false)) as ChatCompletion;
  //

  // const prompt = msg[0].content?.toString() ?? '' + msg[1].content?.toString();
  // const completion = await new LocalOllamaService().completion(prompt);
  // const answer = completion.response;

  const completion = (await new LocalLlamaCppService().completion(
    msg,
  )) as ChatCompletion;

  const answer = completion.choices[0].message.content;

  if (!answer) {
    throw new Error("No content in the response");
  }
  console.log(`LLM response: ${answer}`);

  return answer.toString();
}

async function fetchData(url: string) {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}
