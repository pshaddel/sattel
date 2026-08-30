import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { getRecentFiles, recordFileMention } from "../../src/db/file.db";

const TEMP_DIR = path.join(import.meta.dir, "temp");
const PROJECT_A = "/projects/a";
const PROJECT_B = "/projects/b";

let originalHome: string | undefined;

beforeEach(async () => {
	await fs.promises.mkdir(TEMP_DIR, { recursive: true });
	// The DB is global (~/.sattel/sattel.db) — redirect via SATTEL_HOME so
	// tests never touch the real one (Bun's os.homedir() ignores a runtime
	// HOME reassignment, hence the dedicated override).
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
	project: string;
	path: string;
	attempts: number;
	last_attempt_date: string;
}[] {
	const db = new Database(dbPath());
	try {
		return db
			.query(
				"SELECT project, path, attempts, last_attempt_date FROM mentioned_files",
			)
			.all() as {
			project: string;
			path: string;
			attempts: number;
			last_attempt_date: string;
		}[];
	} finally {
		db.close();
	}
}

function setLastAttemptDate(
	project: string,
	filePath: string,
	iso: string,
): void {
	const db = new Database(dbPath());
	try {
		db.run(
			"UPDATE mentioned_files SET last_attempt_date = ? WHERE project = ? AND path = ?",
			[iso, project, filePath],
		);
	} finally {
		db.close();
	}
}

describe("getRecentFiles", () => {
	test("returns an empty array when nothing has ever been recorded", () => {
		expect(getRecentFiles(5, PROJECT_A)).toEqual([]);
	});

	test("returns an empty array when the .sattel directory doesn't exist and can't be created", () => {
		// Pointing SATTEL_HOME at a file (not a directory) makes mkdir fail,
		// simulating a storage failure without touching real permissions.
		const blockedHome = path.join(TEMP_DIR, "not-a-dir");
		fs.writeFileSync(blockedHome, "im a file, not a directory");
		process.env.SATTEL_HOME = blockedHome;

		expect(getRecentFiles(5, PROJECT_A)).toEqual([]);
	});

	test("creates ~/.sattel/sattel.db on first write", () => {
		recordFileMention("src/index.ts", PROJECT_A);

		expect(fs.existsSync(dbPath())).toBe(true);
	});

	test("excludes a stale entry from reads even before any write has pruned it", () => {
		recordFileMention("stale.ts", PROJECT_A);
		const eightDaysAgo = new Date(
			Date.now() - 8 * 24 * 60 * 60 * 1000,
		).toISOString();
		setLastAttemptDate(PROJECT_A, "stale.ts", eightDaysAgo);

		// No recordFileMention call here — the stale row is still physically
		// present; only the read-time WHERE filter should exclude it.
		expect(getRecentFiles(5, PROJECT_A)).toEqual([]);
		expect(rows().map((row) => row.path)).toEqual(["stale.ts"]);
	});

	test("never surfaces one project's mentions in another project's recent list", () => {
		recordFileMention("a-only.ts", PROJECT_A);
		recordFileMention("b-only.ts", PROJECT_B);

		expect(getRecentFiles(5, PROJECT_A)).toEqual(["a-only.ts"]);
		expect(getRecentFiles(5, PROJECT_B)).toEqual(["b-only.ts"]);
	});
});

describe("recordFileMention", () => {
	test("inserts a new row for a first-time mention", () => {
		recordFileMention("src/index.ts", PROJECT_A);

		expect(rows()).toEqual([
			expect.objectContaining({
				project: PROJECT_A,
				path: "src/index.ts",
				attempts: 1,
			}),
		]);
	});

	test("increments attempts and refreshes the timestamp on a repeat mention, without duplicating rows", () => {
		recordFileMention("src/index.ts", PROJECT_A);
		setLastAttemptDate(PROJECT_A, "src/index.ts", "2020-01-01T00:00:00.000Z");

		recordFileMention("src/index.ts", PROJECT_A);

		const all = rows();
		expect(all).toHaveLength(1);
		expect(all[0]?.attempts).toBe(2);
		expect(all[0]?.last_attempt_date).not.toBe("2020-01-01T00:00:00.000Z");
	});

	test("tracks the same path independently per project", () => {
		recordFileMention("src/index.ts", PROJECT_A);
		recordFileMention("src/index.ts", PROJECT_B);

		const all = rows();
		expect(all).toHaveLength(2);
		expect(all.every((row) => row.path === "src/index.ts")).toBe(true);
		expect(all.map((row) => row.project).sort()).toEqual(
			[PROJECT_A, PROJECT_B].sort(),
		);
	});

	test("returns the most recently mentioned files first", () => {
		recordFileMention("a.ts", PROJECT_A);
		recordFileMention("b.ts", PROJECT_A);
		recordFileMention("c.ts", PROJECT_A);

		expect(getRecentFiles(5, PROJECT_A)).toEqual(["c.ts", "b.ts", "a.ts"]);
	});

	test("caps results at the requested limit", () => {
		for (const file of ["a.ts", "b.ts", "c.ts"]) {
			recordFileMention(file, PROJECT_A);
		}

		expect(getRecentFiles(2, PROJECT_A)).toEqual(["c.ts", "b.ts"]);
	});

	test("drops entries older than a week", () => {
		recordFileMention("stale.ts", PROJECT_A);
		const eightDaysAgo = new Date(
			Date.now() - 8 * 24 * 60 * 60 * 1000,
		).toISOString();
		setLastAttemptDate(PROJECT_A, "stale.ts", eightDaysAgo);

		recordFileMention("fresh.ts", PROJECT_A);

		expect(getRecentFiles(5, PROJECT_A)).toEqual(["fresh.ts"]);
		expect(rows().map((row) => row.path)).toEqual(["fresh.ts"]);
	});

	test("caps the table at 200 rows per project, dropping the oldest first", () => {
		for (let i = 0; i < 201; i++) {
			recordFileMention(`file${i}.ts`, PROJECT_A);
		}

		const all = rows();
		expect(all).toHaveLength(200);
		expect(all.some((row) => row.path === "file0.ts")).toBe(false);
		expect(all.some((row) => row.path === "file200.ts")).toBe(true);
	});

	test("keeps all 200 rows when the cap isn't exceeded", () => {
		for (let i = 0; i < 200; i++) {
			recordFileMention(`file${i}.ts`, PROJECT_A);
		}

		expect(rows()).toHaveLength(200);
	});

	test("re-mentioning the oldest tracked file refreshes its recency, rescuing it from the cap", () => {
		for (let i = 0; i < 200; i++) {
			recordFileMention(`file${i}.ts`, PROJECT_A);
		}
		// file0.ts is currently the oldest entry; re-mentioning it should move
		// it to the front, so file1.ts becomes the new oldest instead.
		recordFileMention("file0.ts", PROJECT_A);

		recordFileMention("file200.ts", PROJECT_A);

		const paths = rows().map((row) => row.path);
		expect(paths).toContain("file0.ts");
		expect(paths).not.toContain("file1.ts");
	});

	test("a busy project's mentions don't evict another project's rows via the shared cap", () => {
		for (let i = 0; i < 200; i++) {
			recordFileMention(`file${i}.ts`, PROJECT_A);
		}
		recordFileMention("only-mention.ts", PROJECT_B);

		for (let i = 200; i < 210; i++) {
			recordFileMention(`file${i}.ts`, PROJECT_A);
		}

		expect(getRecentFiles(5, PROJECT_B)).toEqual(["only-mention.ts"]);
	});

	test("never throws when the .sattel directory can't be created", () => {
		const blockedHome = path.join(TEMP_DIR, "not-a-dir");
		fs.writeFileSync(blockedHome, "im a file, not a directory");
		process.env.SATTEL_HOME = blockedHome;

		expect(() =>
			recordFileMention("src/index.ts", PROJECT_A),
		).not.toThrow();
	});
});
