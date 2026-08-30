import { migration as createMentionedFiles } from "./001-create-mentioned-files";

export interface Migration {
	id: number;
	sql: string;
}

// Ordered oldest to newest; each one's `sql` must be safe to run once and
// forgotten (CREATE TABLE/INDEX IF NOT EXISTS), since applied ids are
// tracked in schema_migrations and never re-run.
export const MIGRATIONS: Migration[] = [createMentionedFiles];
