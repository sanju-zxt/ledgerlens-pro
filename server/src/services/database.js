import pg from "pg";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;
let pool;
let migrationPromise;

export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool() {
  if (!databaseConfigured()) {
    throw Object.assign(new Error("Durable PostgreSQL storage is not configured."), { status: 503 });
  }
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PGPOOL_MAX || 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined
    });
    pool.on("error", error => console.error("PostgreSQL pool error:", error.message));
  }
  return pool;
}

export async function query(text, values) {
  return getPool().query(text, values);
}

export async function withTransaction(operation) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function migrate() {
  if (!databaseConfigured()) return false;
  if (!migrationPromise) {
    migrationPromise = (async () => {
      const client = await getPool().connect();
      try {
        await client.query("SELECT pg_advisory_lock(719304601)");
        await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
        const { rows } = await client.query("SELECT 1 FROM schema_migrations WHERE version = $1", ["001_multi_tenant"]);
        if (!rows.length) {
          const here = path.dirname(fileURLToPath(import.meta.url));
          const sql = await readFile(path.resolve(here, "../../migrations/001_multi_tenant.sql"), "utf8");
          await client.query("BEGIN");
          try {
            await client.query(sql);
            await client.query("INSERT INTO schema_migrations(version) VALUES ($1)", ["001_multi_tenant"]);
            await client.query("COMMIT");
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          }
        }
        return true;
      } finally {
        await client.query("SELECT pg_advisory_unlock(719304601)").catch(() => {});
        client.release();
      }
    })().catch(error => {
      migrationPromise = null;
      throw error;
    });
  }
  return migrationPromise;
}

export function getTenantId(req) {
  return String(req.user?.tenantId || req.user?.userId || "").slice(0, 200);
}
