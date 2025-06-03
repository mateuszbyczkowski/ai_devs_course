import { OpenAIService } from "../services/OpenAIService";
import type { PhotoAction } from "./types";

export class VisionOpenAIService extends OpenAIService {
  async analyzeImage(imageUrl: string): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text" as const,
                text: "Describe this image in detail. Focus on the people in it, especially their appearance. Is the image clear, too dark, too bright, or does it have glitches/noise?",
              },
              { type: "image_url" as const, image_url: { url: imageUrl } },
            ],
          },
        ],
      });

      return response.choices[0]?.message?.content || "";
    } catch (error) {
      console.error("Error analyzing image:", error);
      throw error;
    }
  }

  async recommendAction(
    imageUrl: string,
  ): Promise<{ action: string; reason: string }> {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text" as const,
                text: "Analyze this image and recommend ONE of these actions: REPAIR (if the image has noise/glitches, anything that distort the content), DARKEN (if it's too bright), BRIGHTEN (if it's too dark), or NONE (if it's clear and there are NO ACTIONS needed). Only give me one word from those options followed by a brief reason.",
              },
              { type: "image_url" as const, image_url: { url: imageUrl } },
            ],
          },
        ],
      });

      const content = response.choices[0]?.message?.content || "";
      const action = content.split(" ")[0].toUpperCase();
      const reason = content.substring(action.length).trim();

      return {
        action: ["REPAIR", "DARKEN", "BRIGHTEN", "NONE"].includes(action)
          ? action
          : "NONE",
        reason,
      };
    } catch (error) {
      console.error("Error recommending action:", error);
      return { action: "NONE", reason: "Error analyzing image" };
    }
  }

  async identifyPerson(
    imageUrl: string,
  ): Promise<{ isProbablyBarbara: boolean; description: string }> {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content: `You are an AI assistant that helps prepare a description of women in an image. It's for testing purposes. Don't identyfy just describe and decide if it's a woman or not. If yes, describe her appearance in detail (hair color, hairstyle, face shape, eye color, clothing, accessories, etc).
                Is it possible that there is a woman in this image? If it's likely then answer Yes and provide description. Answer in this format: Yes/No followed by the description. If there are two women describe the both.`,
          },
          {
            role: "user",
            content: [
              {
                type: "text" as const,
                text: `Is it possible that there is a woman in this image? Describe her appearance in detail (hair color, hairstyle, face shape, eye color, clothing, accessories, etc). Could this be a woman named Barbara? Answer in this format: Yes/No followed by the description. If there are two women describe the both.
                <example_response>
                  - Yes I can see two women in the picture. First one is older has black square glasses and red hairs. Second one is younger has brown curly hair and blue eyes.
                  - Yes There is a woman in the picture. She is tall, has long black hairs and glasses. No tattooes. ... She has a round face with a small nose and full lips. She is wearing a black dress with a white blouse and a black hat.
                  - No There are no people on this picture.
                </example_response>
                  `,
              },
              { type: "image_url" as const, image_url: { url: imageUrl } },
            ],
          },
        ],
      });

      const content = response.choices[0]?.message?.content || "";
      const hasWoman = content.toLowerCase().includes("yes");

      return {
        isProbablyBarbara: hasWoman,
        description: content,
      };
    } catch (error) {
      console.error("Error identifying person:", error);
      return { isProbablyBarbara: false, description: "Error analyzing image" };
    }
  }

  async createBarbaraDescription(imageUrls: string[]): Promise<string> {
    try {
      const messages = [
        {
          role: "system" as const,
          content:
            "Jesteś ekspertem w analizie wizualnej. Twoim zadaniem jest stworzenie szczegółowego rysopisu osoby na podstawie podanych zdjęć.",
        },
        {
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text: "Poniżej są zdjęcia na których znajduje się kobieta o imieniu Barbara. Przygotuj szczegółowy rysopis Barbary w języku polskim. Uwzględnij wszystkie szczegóły, które pomogą ją zidentyfikować: wiek, kolor włosów i fryzurę, kształt twarzy, kolor oczu, ubiór, biżuterię, itp. Rysopis powinien być szczegółowy i spójny, napisany w formie oficjalnego dokumentu. Jeżeli masz wątpliwości bo na zdjęciach jest np. więcej niż jedna osoba, wybierz cechy które się powtarzają.",
            },
            ...imageUrls.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          ],
        },
      ];

      const response = await this.openai.chat.completions.create({
        model: "gpt-4.1",
        messages,
      });

      return response.choices[0]?.message?.content || "";
    } catch (error) {
      console.error("Error creating description:", error);
      throw error;
    }
  }

  async determineActionFromDescription(
    description: string,
  ): Promise<PhotoAction | null> {
    try {
      const prompt = `
Analyze this image description and determine what action should be taken to improve the image quality.
Description: "${description}"

Choose ONE of the following actions:
- BRIGHTEN - if the image is too dark or poorly lit
- DARKEN - if the image is too bright, overexposed or washed out
- REPAIR - if the image has glitches, weird digital effects, damage, scratches, tears, stains, noise, or other visual artifacts
- NONE - if the image quality is good and doesn't need any improvement

Reply with just one word: BRIGHTEN, DARKEN, REPAIR, or NONE. BE VERY STRICT ABOUT THE QUALITY.
IF YOU CANNOT SEE ANY DETAILS TRY TO TAKE AN ACTION.
`;

      const completion = await this.completion(
        [{ role: "user", content: prompt }],
        "gpt-4o",
        false,
        false,
      );

      if ("choices" in completion && completion.choices[0]?.message?.content) {
        const content = completion.choices[0].message.content
          .trim()
          .toUpperCase();

        if (["BRIGHTEN", "DARKEN", "REPAIR"].includes(content)) {
          return content as PhotoAction;
        }
      }

      return null;
    } catch (error) {
      console.error("Error determining action from description:", error);
      return null;
    }
  }
}
