import { defineConfig } from "drizzle-kit";

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

export default defineConfig(
  tursoUrl
    ? {
        out: "./migrations",
        schema: "./shared/schema.ts",
        dialect: "turso",
        dbCredentials: {
          url: tursoUrl,
          authToken: tursoToken,
        },
      }
    : {
        out: "./migrations",
        schema: "./shared/schema.ts",
        dialect: "sqlite",
        dbCredentials: {
          url: "./data.db",
        },
      }
);
