import { openDb } from "./db";

export const MAX_RECENT_FILES = 5;
const MAX_TRACKED_FILES = 200;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function cutoffIso(): string {
	return new Date(Date.now() - MAX_AGE_MS).toISOString();
}

/**
 * Records an @-mention for the LRU list shown when the user starts a mention
 * with no query yet: upserts the path's attempt count and timestamp, then
 * drops anything older than a week and caps the table at MAX_TRACKED_FILES
 * (oldest by last_attempt_date dropped first). Storage here is a nice-to-have
 * for the mention palette, so any failure (missing dir, locked file, disk
 * full) is swallowed rather than surfaced to the caller.
 */
export function recordFileMention(
	filePath: string,
	cwd: string = process.cwd(),
): void {
	try {
		const db = openDb(cwd);
		try {
			db.run(
				`INSERT INTO mentioned_files (path, attempts, last_attempt_date)
				 VALUES (?, 1, ?)
				 ON CONFLICT(path) DO UPDATE SET
				   attempts = attempts + 1,
				   last_attempt_date = excluded.last_attempt_date`,
				[filePath, new Date().toISOString()],
			);
			db.run("DELETE FROM mentioned_files WHERE last_attempt_date < ?", [
				cutoffIso(),
			]);
			db.run(
				`DELETE FROM mentioned_files WHERE id NOT IN (
				   SELECT id FROM mentioned_files
				   ORDER BY last_attempt_date DESC
				   LIMIT ?
				 )`,
				[MAX_TRACKED_FILES],
			);
		} finally {
			db.close();
		}
	} catch {
		// See doc comment: never let recording a mention break the CLI.
	}
}

/**
 * Returns up to `limit` most recently mentioned file paths (newest first),
 * for the bare `@` mention palette. Returns an empty array on any failure
 * (fresh project, missing DB, corrupt file) rather than throwing, so an
 * empty history never breaks the palette.
 */
export function getRecentFiles(
	limit: number = MAX_RECENT_FILES,
	cwd: string = process.cwd(),
): string[] {
	try {
		const db = openDb(cwd);
		try {
			const rows = db
				.query(
					`SELECT path FROM mentioned_files
					 WHERE last_attempt_date >= ?
					 ORDER BY last_attempt_date DESC
					 LIMIT ?`,
				)
				.all(cutoffIso(), limit) as { path: string }[];
			return rows.map((row) => row.path);
		} finally {
			db.close();
		}
	} catch {
		return [];
	}
}
