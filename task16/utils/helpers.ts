import fs from "fs/promises";
import path from "path";
import type { PhotoInfo } from "../types";

export async function extractFilenameFromUrl(url: string): Promise<string> {
  const parts = url.split("/");
  return parts[parts.length - 1];
}

export async function saveDataToFile(
  photos: PhotoInfo[],
  filename: string,
): Promise<void> {
  try {
    const filePath = path.join(__dirname, "..", filename);
    await fs.writeFile(
      filePath,
      JSON.stringify(
        photos.map((photo) => ({
          filename: photo.filename,
          url: photo.currentUrl,
          isProbablyBarbara: photo.isProbablyBarbara,
          description: photo.description,
          actions: photo.actions,
        })),
        null,
        2,
      ),
    );
    console.log(`Data saved to ${filePath}`);
  } catch (error) {
    console.error("Error saving data to file:", error);
    throw error;
  }
}
