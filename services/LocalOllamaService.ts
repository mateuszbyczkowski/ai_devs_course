import axios from "axios";

export class LocalOllamaService {
  // ollama for docker
  // docker exec -it ollama ollama run qwen3:4b
  async completion(
    prompt: string,
    model: string = "gemma3:4b",
    stream: boolean = false,
  ): Promise<any> {
    try {
      const chatCompletion = (
        await axios.post(
          "http://localhost:11434/api/generate",
          {
            prompt,
            model,
            stream,
          },
          {
            headers: {
              Accept: "application/*",
              "Content-Type": "application/*",
            },
          },
        )
      ).data;

      return chatCompletion;
    } catch (error) {
      console.error("Error in OpenAI completion:", error);
      throw error;
    }
  }
}
