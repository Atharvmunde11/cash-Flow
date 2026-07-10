import { defineConfig } from "prisma/config";

/** Default local SQLite file — no .env required for development. */
const databaseUrl = process.env.DATABASE_URL?.trim() || "file:./dev.db";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
