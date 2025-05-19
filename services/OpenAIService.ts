import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { ReadStream } from "fs";
import type { AudioResponseFormat } from "openai/resources";

export class OpenAIService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI();
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
      const chatCompletion = await this.openai.chat.completions.create({
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
    response_format?: AudioResponseFormat;
    temperature?: number;
  }): Promise<string> {
    try {
      const { file, model, language, prompt, response_format, temperature } =
        options;

      const transcription = await this.openai.audio.transcriptions.create({
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
}
