import dotenv from "dotenv";
import path from "path";
import fs from "fs/promises";
import { OpenAIService } from "../services/OpenAIService";
import { Neo4jService } from "../services/Neo4JService";
import * as fs_1 from "fs";
import { promisify } from "util";
import { sendAnswerToCentrala } from "../services/CentralaAPIService";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const existsAsync = promisify(fs_1.exists);
const DATA_FILE_PATH = path.resolve(__dirname, "./data.json");

interface DatabaseResponse {
  reply: any[];
  error: string;
}

interface User {
  id: number;
  username: string;
}

interface Connection {
  user1_id: number;
  user2_id: number;
}

interface LocalData {
  users: User[];
  connections: Connection[];
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

async function fetchUsersAndConnections(): Promise<LocalData> {
  // Fetch users
  console.log("Fetching users from MySQL database...");
  const usersQuery = "SELECT id, username FROM users";
  const usersResponse = await queryDatabase(usersQuery);

  if (usersResponse.error !== "OK") {
    throw new Error(`Failed to fetch users: ${usersResponse.error}`);
  }

  const users = usersResponse.reply.map((user) => ({
    id: parseInt(user.id, 10),
    username: user.username,
  }));

  console.log(`Retrieved ${users.length} users`);

  // Fetch connections
  console.log("Fetching connections from MySQL database...");
  const connectionsQuery = "SELECT * FROM connections";
  const connectionsResponse = await queryDatabase(connectionsQuery);

  if (connectionsResponse.error !== "OK") {
    throw new Error(
      `Failed to fetch connections: ${connectionsResponse.error}`,
    );
  }

  const connections = connectionsResponse.reply.map((conn) => ({
    user1_id: parseInt(conn.user1_id, 10),
    user2_id: parseInt(conn.user2_id, 10),
  }));

  console.log(`Retrieved ${connections.length} connections`);

  return { users, connections };
}

async function saveDataLocally(data: LocalData): Promise<void> {
  console.log("Saving data to local JSON file...");
  await fs.writeFile(DATA_FILE_PATH, JSON.stringify(data, null, 2));
  console.log(`Data saved to ${DATA_FILE_PATH}`);
}

async function loadLocalData(): Promise<LocalData | null> {
  try {
    if (await existsAsync(DATA_FILE_PATH)) {
      console.log("Loading data from local JSON file...");
      const fileContent = await fs.readFile(DATA_FILE_PATH, "utf-8");
      return JSON.parse(fileContent) as LocalData;
    }
  } catch (error) {
    console.error("Error loading local data:", error);
  }
  return null;
}

async function truncateNeo4j(): Promise<void> {
  // Initialize Neo4j service
  const uri = process.env.NEO4J_URI || "";
  const username = process.env.NEO4J_USER || "";
  const password = process.env.NEO4J_PASSWORD || "";

  if (!uri || !username || !password) {
    throw new Error(
      "Neo4j connection details not found in environment variables",
    );
  }

  const openAIService = new OpenAIService();
  const neo4jService = new Neo4jService(uri, username, password, openAIService);

  try {
    console.log("Truncating Neo4j database...");
    await neo4jService.runQuery("MATCH (n) DETACH DELETE n");
    console.log("Neo4j database truncated successfully");
  } finally {
    await neo4jService.close();
  }
}

async function loadDataToNeo4j(data: LocalData): Promise<void> {
  const { users, connections } = data;

  // Initialize Neo4j service
  const uri = process.env.NEO4J_URI || "";
  const username = process.env.NEO4J_USER || "";
  const password = process.env.NEO4J_PASSWORD || "";

  if (!uri || !username || !password) {
    throw new Error(
      "Neo4j connection details not found in environment variables",
    );
  }

  const openAIService = new OpenAIService();
  const neo4jService = new Neo4jService(uri, username, password, openAIService);

  console.log("Connected to Neo4j database");

  try {
    // Create user nodes
    console.log("Creating user nodes in Neo4j...");

    const userNodes: Record<number, number> = {};

    for (const user of users) {
      // Check if user already exists in Neo4j
      const existingUser = await neo4jService.findNodeByProperty(
        "User",
        "userId",
        user.id,
      );

      if (existingUser) {
        console.log(
          `User with userId ${user.id} already exists in Neo4j, skipping creation`,
        );
        userNodes[user.id] = existingUser.id;
      } else {
        // Create new user node
        const userProperties = {
          userId: user.id, // Using a different name for the MySQL ID
          username: user.username,
        };

        const result = await neo4jService.addNode("User", userProperties);
        userNodes[user.id] = result.id;
        console.log(
          `Created user node for ${user.username} with Neo4j id ${result.id}`,
        );
      }
    }

    // Create relationships
    console.log("Creating relationships in Neo4j...");
    for (const connection of connections) {
      const fromNodeId = userNodes[connection.user1_id];
      const toNodeId = userNodes[connection.user2_id];

      if (!fromNodeId || !toNodeId) {
        console.warn(
          `Cannot create relationship: missing node IDs for connection ${connection.user1_id} -> ${connection.user2_id}`,
        );
        continue;
      }

      try {
        await neo4jService.connectNodes(fromNodeId, toNodeId, "KNOWS");
        console.log(
          `Created KNOWS relationship: ${connection.user1_id} -> ${connection.user2_id}`,
        );
      } catch (error) {
        // Check if relationship already exists
        console.warn(`Error creating relationship: ${error}`);
      }
    }

    console.log("Finished loading data to Neo4j");
  } finally {
    // Close the Neo4j connection
    await neo4jService.close();
  }
}

async function findShortestPath(): Promise<string> {
  // Initialize Neo4j service
  const uri = process.env.NEO4J_URI || "";
  const username = process.env.NEO4J_USER || "";
  const password = process.env.NEO4J_PASSWORD || "";

  if (!uri || !username || !password) {
    throw new Error(
      "Neo4j connection details not found in environment variables",
    );
  }

  const openAIService = new OpenAIService();
  const neo4jService = new Neo4jService(uri, username, password, openAIService);

  try {
    console.log("Finding shortest path from Rafał to Barbara...");
    const query = `
      MATCH p=shortestPath((start:User {username: "Rafał"})-[:KNOWS*]-(end:User {username: "Barbara"}))
      RETURN [n IN nodes(p) | n.username] as path
    `;

    const result = await neo4jService.runQuery(query);

    if (result.records.length === 0) {
      throw new Error("No path found between Rafał and Barbara");
    }

    const path = result.records[0].get("path");
    const pathString = path.join(",");

    console.log(`Shortest path: ${pathString}`);

    return pathString;
  } finally {
    await neo4jService.close();
  }
}

async function main(): Promise<void> {
  try {
    // Step 1: Truncate Neo4j database
    await truncateNeo4j();

    // Step 2: Check if local data exists
    let data = await loadLocalData();

    // Step 3: If not, fetch from MySQL and save locally
    if (!data) {
      data = await fetchUsersAndConnections();
      await saveDataLocally(data);
    }

    // Step 4: Load data to Neo4j
    await loadDataToNeo4j(data);

    // Step 5: Find shortest path
    const shortestPath = await findShortestPath();

    // Step 6: Send answer to centrala
    await sendAnswerToCentrala(shortestPath, "connections");

    console.log("Task completed successfully");
  } catch (error) {
    console.error("Error in main process:", error);
    process.exit(1);
  }
}

main();
