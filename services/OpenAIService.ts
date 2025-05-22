import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { ReadStream } from "fs";

export class OpenAIService {
  private _openai: OpenAI;

  get openai(): OpenAI {
    return this._openai;
  }

  constructor() {
    this._openai = new OpenAI();
  }

  async completion(
    messages: ChatCompletionMessageParam[],
    model: string = "gpt-4",
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
    response_format?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
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
        response_format = "url"
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
}
