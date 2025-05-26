import fs from "fs";
import path from "path";
import axios from "axios";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { OpenAIService } from "../services/OpenAIService";
import { createReadStream } from "fs";

/**
 * Fetches and processes the article from the given URL
 * - Converts HTML to Markdown
 * - Processes images (downloads and generates descriptions)
 * - Processes audio files (downloads and transcribes)
 */
export async function fetchAndProcessArticle(
  url: string,
  outputDir: string,
  openAIService: OpenAIService,
): Promise<string> {
  try {
    // Fetch the article
    const response = await axios.get(url);
    const html = response.data;

    // Parse HTML
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Create directories for media
    const imagesDir = path.join(outputDir, "images");
    const audioDir = path.join(outputDir, "audio");

    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }

    // Process images and replace with descriptions
    const images = document.querySelectorAll("img");
    for (const img of Array.from(images)) {
      const src = img.getAttribute("src");
      const alt = img.getAttribute("alt") || "";
      const figcaption =
        img.closest("figure")?.querySelector("figcaption")?.textContent || "";

      if (src) {
        // Determine if it's a relative or absolute URL
        const imageUrl = src.startsWith("http") ? src : new URL(src, url).href;
        const imageFilename = path.basename(imageUrl);
        const imagePath = path.join(imagesDir, imageFilename);

        // Download the image
        await downloadFile(imageUrl, imagePath);

        // Generate image description with context
        const description = await generateImageDescription(
          imagePath,
          figcaption,
          alt,
          openAIService,
        );

        // Replace the image with its description
        const descriptionNode = document.createElement("div");
        descriptionNode.classList.add("image-description");
        descriptionNode.textContent = `[IMAGE DESCRIPTION: ${description}]`;

        if (img.parentNode) {
          img.parentNode.replaceChild(descriptionNode, img);
        }
      }
    }

    // Process audio files and replace with transcriptions
    const audioElements = document.querySelectorAll("audio");
    for (const audio of Array.from(audioElements)) {
      // Check for src attribute directly on audio element
      let src = audio.getAttribute("src");

      // If no src attribute on audio element, check for source tags inside
      if (!src) {
        const sourceElement = audio.querySelector("source");
        if (sourceElement) {
          src = sourceElement.getAttribute("src");
        }
      }

      // If we found a source URL, process the audio
      if (src) {
        // Determine if it's a relative or absolute URL
        const audioUrl = src.startsWith("http") ? src : new URL(src, url).href;
        const audioFilename = path.basename(audioUrl);
        const audioPath = path.join(audioDir, audioFilename);

        console.log(`Found audio: ${audioUrl}, downloading to ${audioPath}`);

        try {
          // Download the audio file
          await downloadFile(audioUrl, audioPath);

          // Check if file was downloaded successfully
          if (fs.existsSync(audioPath) && fs.statSync(audioPath).size > 0) {
            console.log(`Successfully downloaded audio: ${audioPath}`);

            // Transcribe audio
            const transcription = await transcribeAudio(
              audioPath,
              openAIService,
            );

            // Replace the audio with its transcription
            const transcriptionNode = document.createElement("div");
            transcriptionNode.classList.add("audio-transcription");
            transcriptionNode.textContent = `[AUDIO TRANSCRIPTION: ${transcription}]`;

            if (audio.parentNode) {
              audio.parentNode.replaceChild(transcriptionNode, audio);
            }
          } else {
            console.error(`Failed to download audio from ${audioUrl}`);
          }
        } catch (error) {
          console.error(`Error processing audio from ${audioUrl}:`, error);
        }
      }
    }

    // Also check for direct audio links that might be in the href attributes
    const audioLinks = document.querySelectorAll(
      "a[href$='.mp3'], a[href$='.wav'], a[href$='.ogg']",
    );
    for (const link of Array.from(audioLinks)) {
      const href = link.getAttribute("href");

      if (href) {
        // Determine if it's a relative or absolute URL
        const audioUrl = href.startsWith("http")
          ? href
          : new URL(href, url).href;
        const audioFilename = path.basename(audioUrl);
        const audioPath = path.join(audioDir, audioFilename);

        console.log(
          `Found audio link: ${audioUrl}, downloading to ${audioPath}`,
        );

        try {
          // Download the audio file
          await downloadFile(audioUrl, audioPath);

          // Check if file was downloaded successfully
          if (fs.existsSync(audioPath) && fs.statSync(audioPath).size > 0) {
            console.log(
              `Successfully downloaded audio from link: ${audioPath}`,
            );

            // Transcribe audio
            const transcription = await transcribeAudio(
              audioPath,
              openAIService,
            );

            // Create a transcription node
            const transcriptionNode = document.createElement("div");
            transcriptionNode.classList.add("audio-transcription");
            transcriptionNode.textContent = `[AUDIO TRANSCRIPTION (from link ${audioFilename}): ${transcription}]`;

            // Insert the transcription after the link
            if (link.parentNode) {
              link.parentNode.insertBefore(transcriptionNode, link.nextSibling);
            }
          } else {
            console.error(`Failed to download audio from link ${audioUrl}`);
          }
        } catch (error) {
          console.error(`Error processing audio from link ${audioUrl}:`, error);
        }
      }
    }

    // Dynamically detect and process audio files mentioned in the text
    console.log(`Scanning for audio references in text...`);

    // Regular expression to match potential audio file paths
    // This matches common audio file extensions in various URL formats
    const audioFileRegex =
      /(?:https?:\/\/[^"\s]+\/([^"\s]+\.(?:mp3|wav|ogg|m4a|flac)))|(?:\/[^"\s]*\/([^"\s]+\.(?:mp3|wav|ogg|m4a|flac)))/g;

    // Scan all text nodes in the document for potential audio file references
    const textNodes = [];
    const walker = document.createTreeWalker(document.body, 4); // NodeFilter.SHOW_TEXT = 4
    let currentNode;

    // Map to track processed audio files to avoid duplicates
    const processedAudioFiles = new Map();

    while ((currentNode = walker.nextNode())) {
      if (currentNode.textContent) {
        let match;
        const audioMatches = [];
        const regex = new RegExp(audioFileRegex);

        // Find all audio file matches in this text node
        while ((match = regex.exec(currentNode.textContent)) !== null) {
          const fullMatch = match[0];
          const filename = match[1] || match[2];

          if (filename) {
            audioMatches.push({
              textNode: currentNode,
              fullMatch,
              filename,
            });
          }
        }

        // Also look for specific text patterns that might indicate audio files
        if (
          currentNode.textContent.includes(".mp3") ||
          currentNode.textContent.includes(".wav") ||
          currentNode.textContent.includes(".ogg")
        ) {
          textNodes.push({
            node: currentNode,
            text: currentNode.textContent,
          });
        }

        // Process found audio files
        for (const match of audioMatches) {
          // Skip if we've already processed this file
          if (processedAudioFiles.has(match.filename)) {
            continue;
          }

          // Construct possible URLs for the audio file
          const possibleUrls = [
            // Direct URL if it's already a full URL
            match.fullMatch.startsWith("http") ? match.fullMatch : null,
            // Try with the base article URL
            new URL(match.filename, url).href,
            // Try common paths
            `https://c3ntrala.ag3nts.org/dane/${match.filename}`,
            `https://c3ntrala.ag3nts.org/dane/audio/${match.filename}`,
            `https://c3ntrala.ag3nts.org/dane/i/${match.filename}`,
          ].filter(Boolean); // Remove null entries

          // Try each URL until we find one that works
          let downloadSuccess = false;
          const audioPath = path.join(audioDir, match.filename);

          for (const audioUrl of possibleUrls) {
            if (!audioUrl) continue;
            try {
              console.log(
                `Attempting to fetch audio: ${path.basename(audioUrl)}`,
              );
              await downloadFile(audioUrl, audioPath);

              if (fs.existsSync(audioPath) && fs.statSync(audioPath).size > 0) {
                console.log(`Downloaded: ${path.basename(audioPath)}`);
                downloadSuccess = true;

                // Mark this file as processed
                processedAudioFiles.set(match.filename, {
                  path: audioPath,
                  url: audioUrl,
                });

                break; // Exit the URL loop once we succeed
              }
            } catch (error) {
              // Continue trying other URLs
            }
          }

          // If we successfully downloaded the file, transcribe it
          if (downloadSuccess) {
            try {
              const transcription = await transcribeAudio(
                audioPath,
                openAIService,
              );

              // Add the transcription near the mention in the text
              const transcriptionElement = document.createElement("div");
              transcriptionElement.classList.add("audio-transcription");
              transcriptionElement.textContent = `[AUDIO TRANSCRIPTION (${match.filename}): ${transcription}]`;

              if (match.textNode.parentNode) {
                const wrapper = document.createElement("span");
                match.textNode.parentNode.insertBefore(
                  wrapper,
                  match.textNode.nextSibling,
                );
                wrapper.appendChild(transcriptionElement);
              }
            } catch (transcriptionError) {
              console.error(`Error transcribing: ${path.basename(audioPath)}`);
            }
          } else {
            console.error(
              `Could not download audio file: ${match.filename} from any of the attempted URLs`,
            );
          }
        }
      }
    }

    // Process text nodes that mention audio files but weren't matched by the regex
    for (const { node, text } of textNodes) {
      // Extract potential audio filenames using a different approach
      const matches = text.match(/([^\/\s"']+\.(?:mp3|wav|ogg|m4a|flac))/g);

      if (matches) {
        for (const audioFilename of matches) {
          // Skip if we've already processed this file
          if (processedAudioFiles.has(audioFilename)) {
            continue;
          }

          // Try common paths for this audio file
          const possibleUrls = [
            `https://c3ntrala.ag3nts.org/dane/${audioFilename}`,
            `https://c3ntrala.ag3nts.org/dane/audio/${audioFilename}`,
            `https://c3ntrala.ag3nts.org/dane/i/${audioFilename}`,
          ];

          // Try each URL until we find one that works
          let downloadSuccess = false;
          const audioPath = path.join(audioDir, audioFilename);

          for (const audioUrl of possibleUrls) {
            try {
              console.log(
                `Checking potential audio: ${path.basename(audioUrl)}`,
              );
              await downloadFile(audioUrl, audioPath);

              if (fs.existsSync(audioPath) && fs.statSync(audioPath).size > 0) {
                console.log(`Found audio: ${path.basename(audioPath)}`);
                downloadSuccess = true;

                // Mark this file as processed
                processedAudioFiles.set(audioFilename, {
                  path: audioPath,
                  url: audioUrl,
                });

                break; // Exit the URL loop once we succeed
              }
            } catch (error) {
              // Continue trying other URLs silently
            }
          }

          // If we successfully downloaded the file, transcribe it
          if (downloadSuccess) {
            try {
              const transcription = await transcribeAudio(
                audioPath,
                openAIService,
              );

              // Add the transcription near the mention in the text
              const transcriptionElement = document.createElement("div");
              transcriptionElement.classList.add("audio-transcription");
              transcriptionElement.textContent = `[AUDIO TRANSCRIPTION (${audioFilename}): ${transcription}]`;

              if (node.parentNode) {
                const wrapper = document.createElement("span");
                node.parentNode.insertBefore(wrapper, node.nextSibling);
                wrapper.appendChild(transcriptionElement);
              }
            } catch (transcriptionError) {
              console.error(`Error transcribing: ${path.basename(audioPath)}`);
            }
          } else {
            // Add a placeholder for audio files we couldn't download
            const placeholderNode = document.createElement("div");
            placeholderNode.classList.add("audio-transcription");
            placeholderNode.textContent = `[AUDIO TRANSCRIPTION: The audio file '${audioFilename}' referenced in the article could not be retrieved]`;

            if (node.parentNode) {
              node.parentNode.insertBefore(placeholderNode, node.nextSibling);
            }
          }
        }
      }
    }

    // Look for audio embedded using data-audio attributes or other custom attributes
    const customAudioElements = document.querySelectorAll("[data-audio]");
    for (const element of Array.from(customAudioElements)) {
      const audioPath = element.getAttribute("data-audio");

      if (audioPath) {
        // Determine if it's a relative or absolute URL
        const audioUrl = audioPath.startsWith("http")
          ? audioPath
          : new URL(audioPath, url).href;
        const audioFilename = path.basename(audioUrl);
        const localAudioPath = path.join(audioDir, audioFilename);

        console.log(
          `Found custom audio: ${audioUrl}, downloading to ${localAudioPath}`,
        );

        try {
          // Download the audio file
          await downloadFile(audioUrl, localAudioPath);

          // Transcribe and handle as above
          if (
            fs.existsSync(localAudioPath) &&
            fs.statSync(localAudioPath).size > 0
          ) {
            const transcription = await transcribeAudio(
              localAudioPath,
              openAIService,
            );

            const transcriptionNode = document.createElement("div");
            transcriptionNode.classList.add("audio-transcription");
            transcriptionNode.textContent = `[AUDIO TRANSCRIPTION (from data-audio): ${transcription}]`;

            // Add the transcription after the element
            if (element.parentNode) {
              element.parentNode.insertBefore(
                transcriptionNode,
                element.nextSibling,
              );
            }
          }
        } catch (error) {
          console.error(
            `Error processing custom audio from ${audioUrl}:`,
            error,
          );
        }
      }
    }

    // Convert HTML to Markdown
    const turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });

    // Get the article content
    const articleContent = document.querySelector("article") || document.body;
    const markdown = turndownService.turndown(articleContent.innerHTML);

    // Save the processed content
    const outputPath = path.join(outputDir, "indexed_content.md");
    fs.writeFileSync(outputPath, markdown);

    console.log(`Article processed and saved to ${outputPath}`);

    return markdown;
  } catch (error) {
    console.error("Error processing article:", error);
    throw error;
  }
}

/**
 * Downloads a file from a URL to a local path if it doesn't already exist
 */
async function downloadFile(url: string, outputPath: string): Promise<void> {
  try {
    // Check if the file already exists
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      if (stats.size > 0) {
        console.log(`Cached: ${path.basename(outputPath)}`);
        return;
      }
    }

    console.log(`Downloading: ${path.basename(url)}`);

    const response = await axios({
      method: "GET",
      url: url,
      responseType: "stream",
      timeout: 30000, // 30 second timeout
      headers: {
        Accept: "*/*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
      },
      maxRedirects: 5,
    });

    // Make sure the directory exists
    const directory = path.dirname(outputPath);
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    const writer = fs.createWriteStream(outputPath);

    return new Promise((resolve, reject) => {
      response.data.pipe(writer);

      let error: Error | null = null;
      writer.on("error", (err) => {
        error = err;
        writer.close();
        reject(err);
      });

      writer.on("close", () => {
        if (!error) {
          console.log(`Downloaded: ${path.basename(outputPath)}`);
          resolve();
        }
        // If there was an error, it would have been rejected already
      });
    });
  } catch (error: any) {
    console.error(`Error downloading file from ${url}:`, error.message);

    // If the error has a response property, log additional details
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Headers: ${JSON.stringify(error.response.headers)}`);
    }

    throw error;
  }
}

/**
 * Generates a description for an image using OpenAI's vision model
 * Caches the description in a JSON file to avoid redundant processing
 */
async function generateImageDescription(
  imagePath: string,
  caption: string,
  alt: string,
  openAIService: OpenAIService,
): Promise<string> {
  try {
    // Create a cache file path based on the image path
    const cachePath = imagePath + ".description.json";

    // Check if a cached description exists
    if (fs.existsSync(cachePath)) {
      try {
        const cachedData = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
        console.log(`Using cached description: ${path.basename(imagePath)}`);
        return cachedData.description;
      } catch (cacheError) {
        console.error(
          `Error reading cached description for ${imagePath}:`,
          cacheError,
        );
        // Continue with generating a new description
      }
    }

    // Read image as base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString("base64");

    // Construct prompt with context
    const contextInfo =
      caption || alt
        ? `This image has the following context: ${caption || ""} ${alt || ""}`
        : "Please describe this image in detail.";

    console.log(`Generating description: ${path.basename(imagePath)}`);

    // Use GPT-4o to analyze the image
    const response = await openAIService.completion(
      [
        {
          role: "system",
          content:
            "You are an expert at analyzing images and providing detailed descriptions. Focus on the main content, people, objects, weather, time of the day, text, and other important elements in the image.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${contextInfo} Provide a comprehensive description of the image content.`,
            },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${base64Image}` },
            },
          ],
        },
      ],
      "gpt-4.1",
    );

    const description = (response as any).choices[0].message.content;

    // Cache the description
    try {
      fs.writeFileSync(cachePath, JSON.stringify({ description }));
    } catch (cacheWriteError) {
      console.error(
        `Error caching description for ${imagePath}:`,
        cacheWriteError,
      );
    }

    return description;
  } catch (error: any) {
    console.error(
      `Error generating description for image ${imagePath}:`,
      error,
    );
    return `[Failed to generate image description: ${error.message || "Unknown error"}]`;
  }
}

/**
 * Transcribes an audio file using OpenAI's Whisper model
 * Caches transcription to avoid redundant processing
 */
async function transcribeAudio(
  audioPath: string,
  openAIService: OpenAIService,
): Promise<string> {
  try {
    console.log(`Checking transcription: ${path.basename(audioPath)}`);

    // Create a cache file path based on the audio path
    const cachePath = audioPath + ".transcription.json";

    // Check if a cached transcription exists
    if (fs.existsSync(cachePath)) {
      try {
        const cachedData = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
        console.log(`Using cached transcription: ${path.basename(audioPath)}`);
        return cachedData.transcription;
      } catch (cacheError) {
        console.error(
          `Error reading cached transcription for ${audioPath}:`,
          cacheError,
        );
        // Continue with generating a new transcription
      }
    }

    console.log(`Transcribing: ${path.basename(audioPath)}`);

    // Check if the file exists and has content
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file does not exist: ${audioPath}`);
    }

    const fileStats = fs.statSync(audioPath);
    if (fileStats.size === 0) {
      throw new Error(`Audio file is empty: ${audioPath}`);
    }

    // File size check passed

    const fileStream = createReadStream(audioPath);

    // Attempt to transcribe the audio
    const transcription = await openAIService.createTranscription({
      file: fileStream as any,
      model: "whisper-1",
      language: "pl",
    });

    // Cache the transcription
    try {
      fs.writeFileSync(cachePath, JSON.stringify({ transcription }));
    } catch (cacheWriteError) {
      console.error(
        `Error caching transcription for ${audioPath}:`,
        cacheWriteError,
      );
    }

    console.log(`Transcribed: ${path.basename(audioPath)}`);
    return transcription;
  } catch (error: any) {
    console.error(`Error transcribing audio ${audioPath}:`, error);
    return `[Failed to transcribe audio: ${error.message || "Unknown error"}]`;
  }
}
