import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createInitialState } from "@openrouter/agent";
import {
	listSessions,
	loadSession,
	saveSession,
	setSessionTitle,
} from "../../src/db/session.db";

const TEMP_DIR = path.join(import.meta.dir, "temp");
const PROJECT_A = "/projects/a";
const PROJECT_B = "/projects/b";

let originalHome: string | undefined;

beforeEach(async () => {
	await fs.promises.mkdir(TEMP_DIR, { recursive: true });
	originalHome = process.env.SATTEL_HOME;
	process.env.SATTEL_HOME = TEMP_DIR;
});

afterEach(async () => {
	process.env.SATTEL_HOME = originalHome;
	await fs.promises.rm(TEMP_DIR, { recursive: true, force: true });
});

function dbPath(): string {
	return path.join(TEMP_DIR, ".sattel", "sattel.db");
}

function rows(): {
	id: string;
	project: string;
	title: string | null;
	conversation_state: string;
	created_at: string;
	updated_at: string;
}[] {
	const db = new Database(dbPath());
	try {
		return db
			.query(
				"SELECT id, project, title, conversation_state, created_at, updated_at FROM sessions",
			)
			.all() as {
			id: string;
			project: string;
			title: string | null;
			conversation_state: string;
			created_at: string;
			updated_at: string;
		}[];
	} finally {
		db.close();
	}
}

function corruptConversationState(id: string): void {
	const db = new Database(dbPath());
	try {
		db.run("UPDATE sessions SET conversation_state = ? WHERE id = ?", [
			"not valid json{{{",
			id,
		]);
	} finally {
		db.close();
	}
}

describe("saveSession", () => {
	test("inserts a new row keyed on the state's own id", () => {
		const state = createInitialState("session-1");

		saveSession(state, PROJECT_A);

		const all = rows();
		expect(all).toHaveLength(1);
		expect(all[0]?.id).toBe("session-1");
		expect(all[0]?.project).toBe(PROJECT_A);
		expect(all[0]?.title).toBeNull();
	});

	test("a second save preserves an already-set title and the original created_at", async () => {
		const state = createInitialState("session-1");
		saveSession(state, PROJECT_A);
		setSessionTitle("session-1", "My Title");
		const createdAt = rows()[0]?.created_at;

		// Ensure a distinguishable timestamp if the clock is fast.
		await new Promise((resolve) => setTimeout(resolve, 5));
		saveSession(state, PROJECT_A);

		const all = rows();
		expect(all).toHaveLength(1);
		expect(all[0]?.title).toBe("My Title");
		expect(all[0]?.created_at).toBe(createdAt as string);
	});

	test("never throws when the .sattel directory can't be created", () => {
		const blockedHome = path.join(TEMP_DIR, "not-a-dir");
		fs.writeFileSync(blockedHome, "im a file, not a directory");
		process.env.SATTEL_HOME = blockedHome;

		expect(() =>
			saveSession(createInitialState("session-1"), PROJECT_A),
		).not.toThrow();
	});
});

describe("setSessionTitle", () => {
	test("updates the title without touching conversation_state", () => {
		const state = createInitialState("session-1");
		saveSession(state, PROJECT_A);
		const before = rows()[0]?.conversation_state;

		setSessionTitle("session-1", "A short title");

		const all = rows();
		expect(all[0]?.title).toBe("A short title");
		expect(all[0]?.conversation_state).toBe(before as string);
	});
});

describe("listSessions", () => {
	test("returns an empty array when nothing has been saved", () => {
		expect(listSessions(PROJECT_A)).toEqual([]);
	});

	test("orders sessions by most recently updated first", async () => {
		saveSession(createInitialState("first"), PROJECT_A);
		await new Promise((resolve) => setTimeout(resolve, 5));
		saveSession(createInitialState("second"), PROJECT_A);

		expect(listSessions(PROJECT_A).map((s) => s.id)).toEqual([
			"second",
			"first",
		]);
	});

	test("never surfaces one project's sessions in another project's list", () => {
		saveSession(createInitialState("a-session"), PROJECT_A);
		saveSession(createInitialState("b-session"), PROJECT_B);

		expect(listSessions(PROJECT_A).map((s) => s.id)).toEqual(["a-session"]);
		expect(listSessions(PROJECT_B).map((s) => s.id)).toEqual(["b-session"]);
	});

	test("caps results at the requested limit", () => {
		for (let i = 0; i < 5; i++) {
			saveSession(createInitialState(`session-${i}`), PROJECT_A);
		}

		expect(listSessions(PROJECT_A, 2)).toHaveLength(2);
	});
});

describe("loadSession", () => {
	test("round-trips a real conversation state", () => {
		const state = createInitialState("session-1");
		saveSession(state, PROJECT_A);

		const restored = loadSession("session-1");

		expect(restored?.id).toBe("session-1");
	});

	test("returns null for an unknown id", () => {
		expect(loadSession("does-not-exist")).toBeNull();
	});

	test("returns null rather than throwing when conversation_state is corrupted", () => {
		saveSession(createInitialState("session-1"), PROJECT_A);
		corruptConversationState("session-1");

		expect(loadSession("session-1")).toBeNull();
	});
});
