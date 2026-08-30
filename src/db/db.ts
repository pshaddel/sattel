import { Database } from "bun:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MIGRATIONS } from "./migrations";

function homeDir(): string {
	// Bun's os.homedir() resolves once and ignores later HOME reassignment, so
	// tests need a dedicated override to redirect the DB without touching the
	// real one.
	return process.env.SATTEL_HOME ?? os.homedir();
}

function dbDir(): string {
	return path.join(homeDir(), ".sattel");
}

function dbPath(): string {
	return path.join(dbDir(), "sattel.db");
}

function runMigrations(db: Database): void {
	db.run(
		"CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY)",
	);
	const applied = new Set(
		(
			db.query("SELECT id FROM schema_migrations").all() as { id: number }[]
		).map((row) => row.id),
	);
	for (const migration of MIGRATIONS) {
		if (applied.has(migration.id)) {
			continue;
		}
		db.run(migration.sql);
		db.run("INSERT INTO schema_migrations (id) VALUES (?)", [migration.id]);
	}
}

/**
 * Opens the global SQLite database at `~/.sattel/sattel.db`, shared across
 * every project sattel is run against (rows are scoped per-project by a
 * `project` column, not by DB file), creating the directory/file and
 * applying any pending migrations if needed. Callers own the returned
 * handle and must `.close()` it.
 */
export function openDb(): Database {
	fs.mkdirSync(dbDir(), { recursive: true });
	const db = new Database(dbPath());
	db.exec("PRAGMA journal_mode = WAL;");
	runMigrations(db);
	return db;
}
