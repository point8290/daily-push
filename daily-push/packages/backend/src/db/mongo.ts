import { MongoClient, Db } from "mongodb";
import { config } from "../config";

let client: MongoClient;
let db: Db;

export async function connectMongo(): Promise<void> {
  client = new MongoClient(config.mongo.url);
  await client.connect();
  db = client.db();

  // Initialize collections with indexes
  await initializeCollections();

  console.log("✓ MongoDB connected");
}

export function getDb(): Db {
  if (!db) throw new Error("MongoDB not connected — call connectMongo() first");
  return db;
}

export async function closeMongo(): Promise<void> {
  if (client) await client.close();
}

async function initializeCollections(): Promise<void> {
  try {
    // Ensure goal_raw_inputs collection exists with indexes
    const goalRawInputsCollection = db.collection("goal_raw_inputs");
    await goalRawInputsCollection.createIndex(
      { userId: 1, goalId: 1 },
      { unique: true },
    );

    // Ensure goal_corrections collection exists with indexes
    const goalCorrectionsCollection = db.collection("goal_corrections");
    await goalCorrectionsCollection.createIndex(
      { userId: 1, goalId: 1 },
      { unique: true },
    );

    // Legacy collection for backwards compatibility
    const userRawInputsCollection = db.collection("user_raw_inputs");
    await userRawInputsCollection.createIndex({ userId: 1 });
  } catch (err: any) {
    // Ignore "already exists" errors
    if (!err.message.includes("already exists")) {
      console.warn(
        "Warning during MongoDB collection initialization:",
        err.message,
      );
    }
  }
}
