import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { CreateEmbeddingResponse } from "openai/resources/embeddings";
import { ReadStream } from "fs";
import fs from "fs";

export class OpenAIService {
  private _openai: OpenAI;
  private readonly JINA_API_KEY = process.env.JINA_API_KEY;

  get openai(): OpenAI {
    return this._openai;
  }

  constructor() {
    this._openai = new OpenAI();
  }

  async completion(
    messages: ChatCompletionMessageParam[],
    model: string = "gpt-4.1",
    temperature: number = 0.7,
    stream: boolean = false,
    jsonMode: boolean = false,
  ): Promise<
    | OpenAI.Chat.Completions.ChatCompletion
    | AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>
  > {
    try {
      const chatCompletion = await this._openai.chat.completions.create({
        messages,
        model,
        temperature,
        stream,
        response_format: jsonMode ? { type: "json_object" } : { type: "text" },
      });

      if (stream) {
        return chatCompletion as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
      } else {
        return chatCompletion as OpenAI.Chat.Completions.ChatCompletion;
      }
    } catch (error) {
      console.error("Error in OpenAI completion:", error);
      throw error;
    }
  }

  /**
   * Transcribes audio files to text using OpenAI's Whisper
   *
   * @param options - Options for audio transcription
   * @returns Transcribed text
   */
  async createTranscription(options: {
    file: ReadStream | File;
    model: string;
    language?: string;
    prompt?: string;
    response_format?: "json" | "text" | "srt" | "verbose_json" | "vtt";
    temperature?: number;
  }): Promise<string> {
    try {
      const { file, model, language, prompt, response_format, temperature } =
        options;

      const transcription = await this._openai.audio.transcriptions.create({
        file,
        model,
        language,
        prompt,
        response_format,
        temperature,
      });

      return typeof transcription === "string"
        ? transcription
        : (transcription as any).text || "";
    } catch (error) {
      console.error("Error in OpenAI transcription:", error);
      throw error;
    }
  }

  /**
   * Generates an image using OpenAI's DALL-E models
   *
   * @param options - Options for image generation
   * @returns URL of the generated image
   */
  async generateImage(options: {
    prompt: string;
    model?: string;
    n?: number;
    size?: "1024x1024" | "1792x1024" | "1024x1792" | "512x512" | "256x256";
    quality?: "standard" | "hd";
    style?: "vivid" | "natural";
    response_format?: "url" | "b64_json";
  }): Promise<string> {
    try {
      const {
        prompt,
        model = "dall-e-3",
        n = 1,
        size = "1024x1024",
        quality = "standard",
        style = "vivid",
        response_format = "url",
      } = options;

      const result = await this._openai.images.generate({
        prompt,
        model,
        n,
        size,
        quality,
        style,
        response_format,
      });

      if (result && result.data && result.data.length > 0) {
        if (response_format === "url" && result.data[0].url) {
          return result.data[0].url;
        } else if (response_format === "b64_json" && result.data[0].b64_json) {
          return result.data[0].b64_json;
        }
      }

      throw new Error("No image data returned from OpenAI");
    } catch (error) {
      console.error("Error in OpenAI image generation:", error);
      throw error;
    }
  }

  async createEmbedding(text: string): Promise<number[]> {
    try {
      const response: CreateEmbeddingResponse =
        await this.openai.embeddings.create({
          model: "text-embedding-3-large",
          input: text,
        });
      return response.data[0].embedding;
    } catch (error) {
      console.error("Error creating embedding:", error);
      throw error;
    }
  }

  async createJinaEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch("https://api.jina.ai/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.JINA_API_KEY}`,
        },
        body: JSON.stringify({
          model: "jina-embeddings-v3",
          task: "text-matching",
          dimensions: 1024,
          late_chunking: false,
          embedding_type: "float",
          input: [text],
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      console.error("Error creating Jina embedding:", error);
      throw error;
    }
  }

  /**
   * Analyzes an image using OpenAI's vision model
   *
   * @param options - Options for image analysis
   * @returns Analyzed text from the image
   */
  async analyzeImage(options: {
    imagePath: string;
    prompt: string;
    model?: string;
    maxTokens?: number;
  }): Promise<string> {
    try {
      const { imagePath, prompt, model = "gpt-4o", maxTokens = 1000 } = options;

      // Read image file and convert to base64
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString("base64");
      const mimeType = imagePath.endsWith(".png") ? "image/png" : "image/jpeg";

      const messages: ChatCompletionMessageParam[] = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ];

      const response = await this._openai.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
      });

      if (response.choices?.[0]?.message?.content) {
        return response.choices[0].message.content.trim();
      }

      throw new Error("No content returned from vision analysis");
    } catch (error) {
      console.error("Error in OpenAI vision analysis:", error);
      throw error;
    }
  }
}
