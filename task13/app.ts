import dotenv from "dotenv";
import path from "path";
import { OpenAIService } from "../services/OpenAIService";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { sendAnswerToCentrala } from "../services/CentralaAPIService";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

interface DatabaseResponse {
  reply: any[];
  error: string;
}

interface Schema {
  [tableName: string]: string;
}

async function getDatabaseSchema(): Promise<Schema> {
  console.log("Fetching available tables...");
  const tablesResponse = await queryDatabase("SHOW TABLES");

  if (!tablesResponse || tablesResponse.error !== "OK") {
    throw new Error(
      `Failed to get tables: ${tablesResponse?.error || "Unknown error"}`,
    );
  }

  // Extract table names
  const tables = tablesResponse.reply.map((row: any) => Object.values(row)[0]);
  console.log(`Found tables: ${tables.join(", ")}`);

  // Get schema for each table
  const schemas: Schema = {};
  for (const table of tables) {
    console.log(`Fetching schema for ${table}...`);
    const schemaResponse = await queryDatabase(`SHOW CREATE TABLE ${table}`);
    if (schemaResponse.error !== "OK") {
      console.error(
        `Failed to get schema for ${table}: ${schemaResponse.error}`,
      );
      continue;
    }

    // Extract the CREATE TABLE statement
    const createTableStatement = schemaResponse.reply[0]["Create Table"];
    schemas[table as string] = createTableStatement;
    console.log(`Retrieved schema for ${table}`);
  }

  return schemas;
}

async function generateSQLQuery(schemas: Schema): Promise<string> {
  const openAIService = new OpenAIService();

  const schemaText = Object.entries(schemas)
    .map(([tableName, schema]) => `Table: ${tableName}\n${schema}`)
    .join("\n\n");

  const messages = [
    {
      role: "system",
      content:
        "You are a SQL expert. Your task is to write a SQL query based on database schemas and requirements.",
    } as ChatCompletionMessageParam,
    {
      role: "user",
      content: `I need a SQL query that will return the ID numbers of active datacenters that are managed by managers who are currently inactive (on vacation).

Here are the database schemas:
${schemaText}

Please provide ONLY the raw SQL query without any explanation or markdown formatting. The query should return just the IDs of the datacenters that meet the criteria.`,
    } as ChatCompletionMessageParam,
  ];

  try {
    const response = await openAIService.completion(messages, "gpt-4");
    if ("choices" in response && response.choices.length > 0) {
      const query = response.choices[0].message.content?.trim();
      if (!query) {
        throw new Error("Empty SQL query received");
      }
      return query;
    } else {
      throw new Error("No response content");
    }
  } catch (error) {
    console.error("Error generating SQL query:", error);
    throw error;
  }
}

async function queryDatabase(query: string): Promise<DatabaseResponse> {
  const apikey = process.env.PERSONAL_API_KEY;
  if (!apikey) {
    throw new Error("API key not found in environment variables");
  }

  console.log(`Executing query: ${query}`);

  try {
    const requestBody = {
      task: "database",
      apikey,
      query,
    };

    const response = await fetch(`${process.env.CENTRALA}/apidb`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `HTTP error! status: ${response.status}, body: ${errorText}`,
      );
    }

    const responseData = await response.json();
    return responseData;
  } catch (error) {
    console.error("Error querying database:", error);
    throw error;
  }
}

async function main(): Promise<number[]> {
  try {
    console.log("1. Discovering database schema...");
    const schemas = await getDatabaseSchema();

    console.log("\n2. Generating SQL query...");
    const sqlQuery = await generateSQLQuery(schemas);

    console.log("\n3. Executing the query...");
    console.log(`SQL: ${sqlQuery}`);
    const queryResult = await queryDatabase(sqlQuery);

    if (queryResult.error !== "OK") {
      throw new Error(`Query execution failed: ${queryResult.error}`);
    }

    // Extract the datacenter IDs from the result and convert to numbers
    const datacenterIds = queryResult.reply.map((row: any) => {
      const value = Object.values(row)[0];
      return typeof value === "string" ? parseInt(value, 10) : value;
    });

    console.log("\nFound active datacenters managed by inactive managers:");
    console.log(datacenterIds);

    return datacenterIds as number[];
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}

main()
  .then((datacenterIds) => {
    sendAnswerToCentrala(datacenterIds, "database");
  })
  .catch((error) => {
    console.error("Task failed:", error);
    process.exit(1);
  });
