import mongoose from "mongoose";

const MONGODB_URI =
  process.env.MONGODB_URI ??
  process.env.MONGO_URL ??
  process.env.MONGO_URI;

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const cache: MongooseCache = global.mongooseCache ?? {
  conn: null,
  promise: null,
};

if (process.env.NODE_ENV !== "production") {
  global.mongooseCache = cache;
}

export async function connectDb(): Promise<typeof mongoose> {
  if (!MONGODB_URI) {
    throw new Error(
      "Set MONGODB_URI, MONGO_URL, or MONGO_URI in .env.local (e.g. mongodb://127.0.0.1:27017/accounting)"
    );
  }
  if (cache.conn) return cache.conn;
  if (!cache.promise) {
    const opts: mongoose.ConnectOptions = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
    };
    // Standalone mongod (not replica set / Atlas cluster): connect directly to the host in the URI.
    const isDirect =
      MONGODB_URI.startsWith("mongodb://") &&
      !/replicaSet=/i.test(MONGODB_URI) &&
      !MONGODB_URI.includes("mongodb+srv://");
    if (isDirect) {
      opts.directConnection = true;
    }
    cache.promise = mongoose.connect(MONGODB_URI, opts).catch((error) => {
      cache.promise = null;
      const message =
        error instanceof Error ? error.message : "Unknown MongoDB error";
      throw new Error(
        `Failed to connect to MongoDB at ${MONGODB_URI}. ${message}`
      );
    });
  }
  cache.conn = await cache.promise;
  return cache.conn;
}
