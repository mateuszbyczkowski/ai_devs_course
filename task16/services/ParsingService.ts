import { VisionOpenAIService } from "../VisionOpenAIService";
import type { ParsedActionResponse, ParsedInitialResponse } from "../types";

export class ParsingService {
  private visionService: VisionOpenAIService;

  private basePath: string = "";

  constructor(visionService: VisionOpenAIService) {
    this.visionService = visionService;
  }

  private extractUrlsDirectly(
    text: string,
    originalFilename: string,
  ): string[] {
    // Try direct URL regex extraction
    const urlRegex = /(https?:\/\/[^\s]+\.(png|jpg|jpeg|PNG))/gi;
    const urlMatches: string[] = text.match(urlRegex) || [];

    // Try to find filenames related to the original file
    const baseFilenameWithoutExtension = originalFilename.replace(
      /\.[^/.]+$/,
      "",
    );
    const relatedFilenameRegex = new RegExp(
      `(${baseFilenameWithoutExtension}_[A-Za-z0-9]+\\.PNG)`,
      "gi",
    );
    const relatedFilenameMatches = text.match(relatedFilenameRegex) || [];

    text.split(" ").forEach((token) => {
      if (token.trim().match(/^[Ii].*\.(?:PNG|png)$/)) {
        urlMatches.push(this.basePath + token.trim());
      }
    });

    // If we found related filenames but no direct URLs, try to construct URLs
    if (relatedFilenameMatches.length > 0 && urlMatches.length === 0) {
      // Try to extract base URL from text
      const baseUrlMatch = text.match(/https?:\/\/[^\s]+\//);
      const baseUrl = baseUrlMatch ? baseUrlMatch[0] : "";

      if (baseUrl) {
        return relatedFilenameMatches.map(
          (filename) => `${baseUrl}${filename}`,
        );
      }
    }

    return urlMatches;
  }

  private extractSuggestedActionFromText(text: string): string | null {
    // Look for phrases suggesting specific actions
    const brightenRegex =
      /try\s+BRIGHTEN|should\s+BRIGHTEN|need\s+to\s+BRIGHTEN|use\s+BRIGHTEN|apply\s+BRIGHTEN/i;
    const darkenRegex =
      /try\s+DARKEN|should\s+DARKEN|need\s+to\s+DARKEN|use\s+DARKEN|apply\s+DARKEN/i;
    const repairRegex =
      /try\s+REPAIR|should\s+REPAIR|need\s+to\s+REPAIR|use\s+REPAIR|apply\s+REPAIR/i;

    if (brightenRegex.test(text)) {
      return "BRIGHTEN";
    } else if (darkenRegex.test(text)) {
      return "DARKEN";
    } else if (repairRegex.test(text)) {
      return "REPAIR";
    }

    return null;
  }

  async parseInitialResponse(response: any): Promise<ParsedInitialResponse> {
    if (!response || !response.message) {
      console.error("Invalid response format:", response);
      throw new Error("Invalid response format");
    }

    const message =
      typeof response.message === "string"
        ? response.message
        : JSON.stringify(response.message);

    try {
      const prompt = `
Extract all image filenames from this message:
"${message}"

I need:
1. The base URL where the images are hosted
2. All image filenames (format: IMG_XXXX.PNG or IMG_XXXX_XXXX.PNG, IMG_XXX_XXXX.PNG or any similar)

Return ONLY a JSON object with this format:
{
  "baseUrl": "the base URL",
  "filenames": ["filename1", "filename2", ...]
}
`;

      const completion = await this.visionService.completion(
        [{ role: "user", content: prompt }],
        "gpt-4.1",
        false,
        true,
      );

      if ("choices" in completion && completion.choices[0]?.message?.content) {
        const content = completion.choices[0].message.content;
        const parsed = JSON.parse(content);

        if (parsed.baseUrl && Array.isArray(parsed.filenames)) {
          const baseUrl = parsed.baseUrl.endsWith("/")
            ? parsed.baseUrl
            : `${parsed.baseUrl}/`;
          this.basePath = baseUrl;
          const urls: string[] = [];
          for (const filename of parsed.filenames) {
            urls.push(`${baseUrl}${filename}`);
          }
          console.log("Extracted URLs:", urls);
          return {
            baseUrl,
            filenames: parsed.filenames,
            urls,
          };
        } else {
          throw new Error("Invalid parsed content structure");
        }
      } else {
        throw new Error("No content in completion response");
      }
    } catch (error) {
      console.error("Error parsing initial response:", error);
      throw error;
    }
  }

  async parseActionResponse(
    response: any,
    originalFilename: string,
  ): Promise<ParsedActionResponse> {
    if (!response) {
      console.error("Invalid action response format:", response);
      throw new Error("Invalid action response format");
    }

    // Log the raw response for debugging
    console.log("Raw action response:", JSON.stringify(response, null, 2));

    const message =
      typeof response === "string"
        ? response
        : typeof response.message === "string"
          ? response.message
          : JSON.stringify(response);

    console.log("Extracted message:", message);

    // Try direct URL extraction first
    const directUrls = this.extractUrlsDirectly(message, originalFilename);
    if (directUrls.length > 0) {
      console.log("Direct URL extraction found:", directUrls);

      // Check for suggested actions
      const suggestedAction = this.extractSuggestedActionFromText(message);

      return {
        urls: directUrls,
        suggestedAction,
      };
    }

    try {
      const prompt = `
I applied an operation (REPAIR, BRIGHTEN, or DARKEN) to an image called "${originalFilename}".
Here's the response I received:
"${message}"

Extract the following information:
1. ALL new filenames mentioned (format examples: IMG_XXX_YYYY.PNG where YYYY might be FXED, DRKN, BRTN, FT12, FGR4, NRR7, etc.)
2. The complete URLs to any new images if present
3. If there's a suggestion to try a different operation (like "try BRIGHTEN instead"), extract that suggestion

IMPORTANT INSTRUCTIONS:
- Scan the ENTIRE message character by character
- Look for ANY string that starts with 'IMG_' and ends with '.PNG'
- Include ALL variants in your response, no matter how unusual their naming pattern
- If there are multiple variants of the same base filename, include ALL of them

Return ONLY a JSON object with this format:
{
  "newFilenames": ["filename1", "filename2", ...],
  "completeUrls": ["url1", "url2", ...],
  "suggestedAction": "REPAIR, BRIGHTEN, or DARKEN if suggested, or null if no suggestion"
}

BE EXTREMELY THOROUGH. Your task is to find EVERY SINGLE image filename mentioned, even if they appear in the middle of sentences or have unusual suffixes.
`;

      const completion = await this.visionService.completion(
        [{ role: "user", content: prompt }],
        "gpt-4.1",
        false,
        true,
      );

      if ("choices" in completion && completion.choices[0]?.message?.content) {
        const content = completion.choices[0].message.content;
        const parsed = JSON.parse(content);
        let urls: string[] = [];
        let suggestedAction: string | null = parsed.suggestedAction || null;

        // Normalize suggested action
        if (suggestedAction) {
          suggestedAction = suggestedAction.toUpperCase();
          if (!["REPAIR", "BRIGHTEN", "DARKEN"].includes(suggestedAction)) {
            suggestedAction = null;
          }
        }

        // Handle multiple URLs and filenames
        if (
          parsed.completeUrls &&
          Array.isArray(parsed.completeUrls) &&
          parsed.completeUrls.length > 0
        ) {
          urls = parsed.completeUrls.filter(
            (url: string) => typeof url === "string" && url.trim() !== "",
          );
        }

        // If we have filenames but no URLs, construct URLs from base URL + filenames
        if (
          urls.length === 0 &&
          parsed.newFilenames &&
          Array.isArray(parsed.newFilenames) &&
          parsed.newFilenames.length > 0
        ) {
          const baseUrlMatch = message.match(/https?:\/\/[^\s]+\//);
          const baseUrl = baseUrlMatch ? baseUrlMatch[0] : "";

          if (baseUrl) {
            urls = parsed.newFilenames
              .filter(
                (filename: string) =>
                  typeof filename === "string" && filename.trim() !== "",
              )
              .map((filename: string) => `${baseUrl}${filename}` as string);
          }
        }

        // Legacy support for old format
        if (urls.length === 0) {
          if (parsed.completeUrl) {
            urls = [parsed.completeUrl];
          } else if (parsed.newFilename) {
            const baseUrlMatch = message.match(/https?:\/\/[^\s]+\//);
            const baseUrl = baseUrlMatch ? baseUrlMatch[0] : "";
            if (baseUrl && parsed.newFilename) {
              urls = [`${baseUrl}${parsed.newFilename}`];
            }
          }
        }

        return { urls, suggestedAction };
      } else {
        throw new Error("No content in completion response");
      }
    } catch (error) {
      console.error("Error parsing action response:", error);
      throw error;
    }
  }
}
