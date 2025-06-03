import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

export async function sendAnswerToCentrala(
  answer: string | Record<string, string> | string[] | number[],
  task: string,
) {
  try {
    // Create the final payload
    const payload = {
      apikey: process.env.PERSONAL_API_KEY,
      task,
      answer,
    };

    console.log(
      "Sending payload to centrala:",
      JSON.stringify(payload, null, 2),
    );

    try {
      // Send the data to centrala
      const response = await fetch(`${process.env.CENTRALA}/report`, {
        method: 'POST',
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      console.log("Centrala response:", data);
      return data;
    } catch (error: any) {
      console.error("Error sending answer to centrala:", error.message);
      throw error;
    }
  } catch (error) {
    console.error("Error sending answer to centrala:", error);
    throw error;
  }
}
