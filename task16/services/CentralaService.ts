import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export class CentralaService {
  private apiKey: string;
  private centralaUrl: string;

  constructor() {
    const apikey = process.env.PERSONAL_API_KEY;
    if (!apikey) {
      throw new Error("API key not found in environment variables");
    }
    this.apiKey = apikey;

    const centralaUrl = process.env.CENTRALA;
    if (!centralaUrl) {
      throw new Error("CENTRALA URL not found in environment variables");
    }
    this.centralaUrl = centralaUrl;
  }

  async sendMessage(message: string): Promise<any> {
    try {
      const response = await fetch(
        `${this.centralaUrl}/report`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            task: "photos",
            apikey: this.apiKey,
            answer: message,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error communicating with centrala:", error);
      throw error;
    }
  }
}