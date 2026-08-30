import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { MIGRATIONS } from "./migrations";

function dbPath(cwd: string): string {
	return path.join(cwd, ".sattel", "sattel.db");
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
 * Opens the project-local SQLite database at `.sattel/sattel.db`, creating
 * the directory/file and applying any pending migrations if needed. Callers
 * own the returned handle and must `.close()` it.
 */
export function openDb(cwd: string = process.cwd()): Database {
	fs.mkdirSync(path.join(cwd, ".sattel"), { recursive: true });
	const db = new Database(dbPath(cwd));
	db.exec("PRAGMA journal_mode = WAL;");
	runMigrations(db);
	return db;
}
