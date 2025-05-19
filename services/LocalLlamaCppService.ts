import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import axios from "axios";

export class LocalLlamaCppService {
  //llama-server --hf-repo modularai/Llama-3.1-8B-Instruct-GGUF:Q4_K_M --port 8081
  async completion(
    messages: ChatCompletionMessageParam[],
    model: string = "meta-llama/Meta-Llama-3.1-8B-Instruct",
    stream: boolean = false,
    jsonMode: boolean = false,
  ): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>> {
    try {
      const chatCompletion = (
        await axios.post(
          "http://localhost:8081/v1/chat/completions",
          {
            messages,
            model,
            stream,
            response_format: jsonMode
              ? { type: "json_object" }
              : { type: "text" },
          },
          {
            headers: {
              Accept: "application/*",
              "Content-Type": "application/*",
            },
          },
        )
      ).data;

      console.log(chatCompletion);

      if (stream) {
        return chatCompletion as AsyncIterable<ChatCompletionChunk>;
      } else {
        return chatCompletion as ChatCompletion;
      }
    } catch (error) {
      console.error("Error in Llama cpp completion:", error);
      throw error;
    }
  }
}
