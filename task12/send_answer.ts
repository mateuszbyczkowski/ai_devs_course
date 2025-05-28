import path from "path";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

export async function sendAnswerToCentrala(answer: string) {
  try {
    // Create the final payload
    const payload = {
      apikey: process.env.PERSONAL_API_KEY,
      task: "wektory",
      answer,
    };

    console.log(
      "Sending payload to centrala:",
      JSON.stringify(payload, null, 2),
    );

    try {
      // Send the data to centrala
      const response = await axios.post(
        "https://c3ntrala.ag3nts.org/report",
        payload,
        {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          },
        },
      );

      console.log("Centrala response:", response.data);
      return response.data;
    } catch (error: any) {
      console.error("Error sending answer to centrala:", error.message);
      if (error.response) {
        console.error("Response data:", error.response.data);
        console.error("Response status:", error.response.status);
        console.error("Response headers:", error.response.headers);
      }
      throw error;
    }
  } catch (error) {
    console.error("Error sending answer to centrala:", error);
    throw error;
  }
}
