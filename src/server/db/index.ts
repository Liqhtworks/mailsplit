import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";
import { mkdirSync } from "fs";

mkdirSync("./data", { recursive: true });

export const sqlite = new Database("./data/mailsplit.db");
sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;
