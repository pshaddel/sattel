import {
	type ConversationState,
	deserializeConversationState,
	serializeConversationState,
} from "@openrouter/agent";
import { openDb } from "./db";

export const MAX_LISTED_SESSIONS = 20;

/**
 * Upserts a session's serialized conversation state, keyed on the SDK's own
 * `state.id`. The `DO UPDATE SET` clause deliberately never mentions `title`
 * or `created_at`, so a repeat save (this fires on every turn, via the
 * `sessionState.save` StateAccessor) can never clobber a title set by
 * `setSessionTitle` or the row's original insert-time `created_at`. Like
 * `file.db.ts`, any storage failure is swallowed rather than surfaced, since
 * this must never break an otherwise-successful turn.
 */
export function saveSession(
	state: ConversationState,
	project: string = process.cwd(),
): void {
	try {
		const db = openDb();
		try {
			const now = new Date().toISOString();
			db.run(
				`INSERT INTO sessions (id, project, title, conversation_state, created_at, updated_at)
				 VALUES (?, ?, NULL, ?, ?, ?)
				 ON CONFLICT(id) DO UPDATE SET
				   conversation_state = excluded.conversation_state,
				   updated_at = excluded.updated_at`,
				[state.id, project, serializeConversationState(state), now, now],
			);
		} finally {
			db.close();
		}
	} catch {
		// See doc comment: never let session persistence break the CLI.
	}
}

/**
 * Sets a session's display title (generated separately via
 * `generateSessionTitle`). Swallows storage failures like every other
 * function here.
 */
export function setSessionTitle(id: string, title: string): void {
	try {
		const db = openDb();
		try {
			db.run("UPDATE sessions SET title = ? WHERE id = ?", [title, id]);
		} finally {
			db.close();
		}
	} catch {
		// See doc comment on saveSession.
	}
}

/**
 * Returns up to `limit` most recently updated sessions for `project`
 * (newest first), for the `/resume` picker. Returns an empty array on any
 * failure rather than throwing.
 */
export function listSessions(
	project: string = process.cwd(),
	limit: number = MAX_LISTED_SESSIONS,
): { id: string; title: string | null; updatedAt: string }[] {
	try {
		const db = openDb();
		try {
			return db
				.query(
					`SELECT id, title, updated_at AS updatedAt FROM sessions
					 WHERE project = ?
					 ORDER BY updated_at DESC
					 LIMIT ?`,
				)
				.all(project, limit) as {
				id: string;
				title: string | null;
				updatedAt: string;
			}[];
		} finally {
			db.close();
		}
	} catch {
		return [];
	}
}

/**
 * Loads and deserializes a session's conversation state by id. `id` is
 * globally unique (assigned by the SDK), so no `project` filter is needed —
 * the only caller sources `id` from that project's own `listSessions()`
 * result. Returns `null` on any failure, including a corrupted or
 * unsupported-version stored blob, rather than throwing.
 */
export function loadSession(id: string): ConversationState | null {
	try {
		const db = openDb();
		try {
			const row = db
				.query("SELECT conversation_state FROM sessions WHERE id = ?")
				.get(id) as { conversation_state: string } | null;
			if (!row) {
				return null;
			}
			try {
				return deserializeConversationState(row.conversation_state);
			} catch {
				return null;
			}
		} finally {
			db.close();
		}
	} catch {
		return null;
	}
}
