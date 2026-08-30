export const migration = {
	id: 1,
	sql: `
		CREATE TABLE IF NOT EXISTS mentioned_files (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			path TEXT NOT NULL UNIQUE,
			attempts INTEGER NOT NULL DEFAULT 0,
			last_attempt_date TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_mentioned_files_last_attempt_date
			ON mentioned_files (last_attempt_date);
	`,
};
