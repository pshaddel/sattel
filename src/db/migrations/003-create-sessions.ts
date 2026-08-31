export const migration = {
	id: 3,
	sql: `
		CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			project TEXT NOT NULL,
			title TEXT,
			conversation_state TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_sessions_project_updated_at
			ON sessions (project, updated_at);
	`,
};
