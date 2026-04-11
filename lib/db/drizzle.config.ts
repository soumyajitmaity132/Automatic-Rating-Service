/// <reference types="node" />
import { defineConfig } from "drizzle-kit";
import path from "path";
import { fileURLToPath } from "url";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required; ensure the database is provisioned");
}

// Choose dialect based on DATABASE_URL prefix (supports mysql/mariadb and postgresql)
let dialect: "postgresql" | "mysql" = "postgresql";
if (databaseUrl.startsWith("mysql:") || databaseUrl.startsWith("mariadb:")) {
  dialect = "mysql";
}

const __filePath = fileURLToPath(import.meta.url);
const __dirPath = path.dirname(__filePath);

export default defineConfig({
  schema: path.join(__dirPath, "./src/schema/index.ts"),
  dialect,
  dbCredentials: {
    url: databaseUrl,
  },
});
