import { QdrantClient } from "@qdrant/js-client-rest";
import { v4 as uuidv4 } from "uuid";
import { OpenAIService } from "./OpenAIService";
import fs from "fs/promises";
import path from "path";

export class VectorService {
  private client: QdrantClient;
  private openAIService: OpenAIService;

  constructor(openAIService: OpenAIService) {
    this.client = new QdrantClient({
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY,
    });
    this.openAIService = openAIService;
  }

  async ensureCollection(name: string, size: number = 3072) {
    const collections = await this.client.getCollections();
    if (!collections.collections.some((c) => c.name === name)) {
      await this.client.createCollection(name, {
        vectors: { size, distance: "Cosine" },
      });
    }
  }

  async initializeCollectionWithData(
    name: string,
    points: Array<{
      id?: string;
      text: string;
      metadata?: Record<string, any>;
    }>,
  ) {
    const collections = await this.client.getCollections();
    if (!collections.collections.some((c) => c.name === name)) {
      await this.ensureCollection(name);
      await this.addPoints(name, points);
    }
  }

  async addPoints(
    collectionName: string,
    points: Array<{
      id?: string;
      text: string;
      metadata?: Record<string, any>;
    }>,
  ) {
    const pointsToUpsert = await Promise.all(
      points.map(async (point) => {
        const embedding = await this.openAIService.createEmbedding(point.text);

        // Ensure ID is a valid UUID
        let pointId = point.id || uuidv4();
        if (
          pointId &&
          !pointId.match(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
          )
        ) {
          pointId = uuidv4();
        }

        return {
          id: pointId,
          vector: embedding,
          payload: {
            text: point.text,
            original_id: point.id, // Store original ID in payload if needed
            ...point.metadata,
          },
        };
      }),
    );

    const pointsFilePath = path.join(__dirname, "points.json");
    await fs.writeFile(pointsFilePath, JSON.stringify(pointsToUpsert, null, 2));

    await this.client.upsert(collectionName, {
      wait: true,
      points: pointsToUpsert,
    });
  }

  async performSearch(
    collectionName: string,
    query: string,
    filter: Record<string, any> = {},
    limit: number = 5,
  ) {
    const queryEmbedding = await this.openAIService.createEmbedding(query);

    try {
      return this.client.search(collectionName, {
        vector: queryEmbedding,
        limit,
        with_payload: true,
        filter,
      });
    } catch (error) {
      console.error("Error during vector search:", error);
      throw error;
    }
  }
}
