import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Disable SSL certificate verification for self-signed certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

export async function sendAnswerToCentrala(
  answer:
    | string
    | Record<string, string>
    | string[]
    | number[]
    | object
    | object[],
  task: string,
  justUpdate?: boolean,
) {
  try {
    // Create the final payload
    const payload: any = {
      apikey: process.env.PERSONAL_API_KEY,
      task,
      answer,
    };

    // Add justUpdate if specified (hint for bypassing tests)
    if (justUpdate) {
      payload.justUpdate = true;
    }

    console.log(
      "Sending payload to centrala:",
      JSON.stringify(payload, null, 2),
    );

    try {
      // Send the data to centrala
      const response = await fetch(`${process.env.CENTRALA}/report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Centrala error response:", data);
        throw new Error(
          `HTTP error! Status: ${response.status}, Response: ${JSON.stringify(data)}`,
        );
      }

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
