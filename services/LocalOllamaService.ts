export class LocalOllamaService {
  // ollama for docker
  // docker exec -it ollama ollama run qwen3:4b
  async completion(
    prompt: string,
    model: string = "gemma3:4b",
    stream: boolean = false,
  ): Promise<any> {
    try {
      const response = await fetch(
        "http://localhost:11434/api/generate",
        {
          method: "POST",
          headers: {
            Accept: "application/*",
            "Content-Type": "application/*",
          },
          body: JSON.stringify({
            prompt,
            model,
            stream,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const chatCompletion = await response.json();
      return chatCompletion;
    } catch (error) {
      console.error("Error in OpenAI completion:", error);
      throw error;
    }
  }
}
