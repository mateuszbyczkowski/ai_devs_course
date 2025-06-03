import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

export class LocalLlamaCppService {
  //llama-server --hf-repo modularai/Llama-3.1-8B-Instruct-GGUF:Q4_K_M --port 8081
  async completion(
    messages: ChatCompletionMessageParam[],
    model: string = "meta-llama/Meta-Llama-3.1-8B-Instruct",
    stream: boolean = false,
    jsonMode: boolean = false,
  ): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>> {
    try {
      const response = await fetch(
        "http://localhost:8081/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Accept: "application/*",
            "Content-Type": "application/*",
          },
          body: JSON.stringify({
            messages,
            model,
            stream,
            response_format: jsonMode
              ? { type: "json_object" }
              : { type: "text" },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const chatCompletion = await response.json();
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
