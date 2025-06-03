import type {
  ChatCompletion,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

// Run the function if this file is executed directly
if (require.main === module || import.meta.main) {
  zad5().then(result => {
    console.log("Execution result:", result);
  }).catch(error => {
    console.error("Error during execution:", error);
  });
}


import { anonymizeDataPrompt } from "../prompts.ts";
import { OpenAIService } from "../services/OpenAIService.ts";
import { LocalOllamaService } from "../services/LocalOllamaService.ts";
import { LocalLlamaCppService } from "../services/LocalLlamaCppService.ts";
import type { Request } from "express-serve-static-core";
import type { ParsedQs } from "qs";
import "dotenv/config";

const openaiService = new OpenAIService();

async function submitData(anonymizedData: string) {
  const payload = {
    task: "CENZURA",
    apikey: process.env.PERSONAL_API_KEY,
    answer: anonymizedData,
  };

  const response = await fetch(`${process.env.CENTRALA}/report`, {
    method: 'POST',
    headers: { 
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const resp = await response.json();
  return resp;
}

export async function zad5(req?: any) {
  const realData = await fetchData(
    `${process.env.CENTRALA}/data/${process.env.PERSONAL_API_KEY}/cenzura.txt`,
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
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    console.error("Error fetching data:", error);
    throw error;
  }
}
