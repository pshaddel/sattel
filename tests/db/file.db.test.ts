import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { getRecentFiles, recordFileMention } from "../../src/db/file.db";

const TEMP_DIR = path.join(import.meta.dir, "temp");

beforeEach(async () => {
	await fs.promises.mkdir(TEMP_DIR, { recursive: true });
});

afterEach(async () => {
	await fs.promises.rm(TEMP_DIR, { recursive: true, force: true });
});

function dbPath(): string {
	return path.join(TEMP_DIR, ".sattel", "sattel.db");
}

function rows(): {
	path: string;
	attempts: number;
	last_attempt_date: string;
}[] {
	const db = new Database(dbPath());
	try {
		return db
			.query("SELECT path, attempts, last_attempt_date FROM mentioned_files")
			.all() as { path: string; attempts: number; last_attempt_date: string }[];
	} finally {
		db.close();
	}
}

function setLastAttemptDate(filePath: string, iso: string): void {
	const db = new Database(dbPath());
	try {
		db.run("UPDATE mentioned_files SET last_attempt_date = ? WHERE path = ?", [
			iso,
			filePath,
		]);
	} finally {
		db.close();
	}
}

describe("getRecentFiles", () => {
	test("returns an empty array when nothing has ever been recorded", () => {
		expect(getRecentFiles(5, TEMP_DIR)).toEqual([]);
	});

	test("returns an empty array when the .sattel directory doesn't exist and can't be created", () => {
		// Passing a path nested under a file (not a directory) makes mkdir fail,
		// simulating a storage failure without touching real permissions.
		const blockedCwd = path.join(TEMP_DIR, "not-a-dir");
		fs.writeFileSync(blockedCwd, "im a file, not a directory");

		expect(getRecentFiles(5, blockedCwd)).toEqual([]);
	});

	test("creates .sattel/sattel.db on first write", () => {
		recordFileMention("src/index.ts", TEMP_DIR);

		expect(fs.existsSync(dbPath())).toBe(true);
	});

	test("excludes a stale entry from reads even before any write has pruned it", () => {
		recordFileMention("stale.ts", TEMP_DIR);
		const eightDaysAgo = new Date(
			Date.now() - 8 * 24 * 60 * 60 * 1000,
		).toISOString();
		setLastAttemptDate("stale.ts", eightDaysAgo);

		// No recordFileMention call here — the stale row is still physically
		// present; only the read-time WHERE filter should exclude it.
		expect(getRecentFiles(5, TEMP_DIR)).toEqual([]);
		expect(rows().map((row) => row.path)).toEqual(["stale.ts"]);
	});
});

describe("recordFileMention", () => {
	test("inserts a new row for a first-time mention", () => {
		recordFileMention("src/index.ts", TEMP_DIR);

		expect(rows()).toEqual([
			expect.objectContaining({ path: "src/index.ts", attempts: 1 }),
		]);
	});

	test("increments attempts and refreshes the timestamp on a repeat mention, without duplicating rows", () => {
		recordFileMention("src/index.ts", TEMP_DIR);
		setLastAttemptDate("src/index.ts", "2020-01-01T00:00:00.000Z");

		recordFileMention("src/index.ts", TEMP_DIR);

		const all = rows();
		expect(all).toHaveLength(1);
		expect(all[0]?.attempts).toBe(2);
		expect(all[0]?.last_attempt_date).not.toBe("2020-01-01T00:00:00.000Z");
	});

	test("returns the most recently mentioned files first", () => {
		recordFileMention("a.ts", TEMP_DIR);
		recordFileMention("b.ts", TEMP_DIR);
		recordFileMention("c.ts", TEMP_DIR);

		expect(getRecentFiles(5, TEMP_DIR)).toEqual(["c.ts", "b.ts", "a.ts"]);
	});

	test("caps results at the requested limit", () => {
		for (const file of ["a.ts", "b.ts", "c.ts"]) {
			recordFileMention(file, TEMP_DIR);
		}

		expect(getRecentFiles(2, TEMP_DIR)).toEqual(["c.ts", "b.ts"]);
	});

	test("drops entries older than a week", () => {
		recordFileMention("stale.ts", TEMP_DIR);
		const eightDaysAgo = new Date(
			Date.now() - 8 * 24 * 60 * 60 * 1000,
		).toISOString();
		setLastAttemptDate("stale.ts", eightDaysAgo);

		recordFileMention("fresh.ts", TEMP_DIR);

		expect(getRecentFiles(5, TEMP_DIR)).toEqual(["fresh.ts"]);
		expect(rows().map((row) => row.path)).toEqual(["fresh.ts"]);
	});

	test("caps the table at 200 rows, dropping the oldest first", () => {
		for (let i = 0; i < 201; i++) {
			recordFileMention(`file${i}.ts`, TEMP_DIR);
		}

		const all = rows();
		expect(all).toHaveLength(200);
		expect(all.some((row) => row.path === "file0.ts")).toBe(false);
		expect(all.some((row) => row.path === "file200.ts")).toBe(true);
	});

	test("keeps all 200 rows when the cap isn't exceeded", () => {
		for (let i = 0; i < 200; i++) {
			recordFileMention(`file${i}.ts`, TEMP_DIR);
		}

		expect(rows()).toHaveLength(200);
	});

	test("re-mentioning the oldest tracked file refreshes its recency, rescuing it from the cap", () => {
		for (let i = 0; i < 200; i++) {
			recordFileMention(`file${i}.ts`, TEMP_DIR);
		}
		// file0.ts is currently the oldest entry; re-mentioning it should move
		// it to the front, so file1.ts becomes the new oldest instead.
		recordFileMention("file0.ts", TEMP_DIR);

		recordFileMention("file200.ts", TEMP_DIR);

		const paths = rows().map((row) => row.path);
		expect(paths).toContain("file0.ts");
		expect(paths).not.toContain("file1.ts");
	});

	test("never throws when the .sattel directory can't be created", () => {
		const blockedCwd = path.join(TEMP_DIR, "not-a-dir");
		fs.writeFileSync(blockedCwd, "im a file, not a directory");

		expect(() => recordFileMention("src/index.ts", blockedCwd)).not.toThrow();
	});
});
