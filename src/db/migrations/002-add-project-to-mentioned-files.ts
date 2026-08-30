export const migration = {
	id: 2,
	sql: `
		CREATE TABLE IF NOT EXISTS mentioned_files_new (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			project TEXT NOT NULL,
			path TEXT NOT NULL,
			attempts INTEGER NOT NULL DEFAULT 0,
			last_attempt_date TEXT NOT NULL,
			UNIQUE(project, path)
		);
		INSERT INTO mentioned_files_new (project, path, attempts, last_attempt_date)
			SELECT '', path, attempts, last_attempt_date FROM mentioned_files;
		DROP TABLE mentioned_files;
		ALTER TABLE mentioned_files_new RENAME TO mentioned_files;
		CREATE INDEX IF NOT EXISTS idx_mentioned_files_project_last_attempt_date
			ON mentioned_files (project, last_attempt_date);
	`,
};
