import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { listProjectFiles } from "../../src/context/projectFiles";

const TEMP_DIR = path.join(import.meta.dir, "temp-projectFiles");

function tempPath(...segments: string[]) {
	return path.join(TEMP_DIR, ...segments);
}

async function writeFile(relativePath: string, content = "") {
	const fullPath = tempPath(relativePath);
	await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
	await fs.promises.writeFile(fullPath, content, "utf8");
}

beforeEach(async () => {
	await fs.promises.mkdir(TEMP_DIR, { recursive: true });
});

afterEach(async () => {
	await fs.promises.rm(TEMP_DIR, { recursive: true, force: true });
});

describe("listProjectFiles", () => {
	test("lists nested files as sorted, POSIX-style relative paths", async () => {
		await writeFile("a.ts");
		await writeFile("src/index.ts");
		await writeFile("src/ui/styles.ts");

		expect(await listProjectFiles(TEMP_DIR)).toEqual([
			"a.ts",
			"src/index.ts",
			"src/ui/styles.ts",
		]);
	});

	test("always skips .git, node_modules, dist, and .sattel", async () => {
		await writeFile("keep.ts");
		await writeFile(".git/HEAD");
		await writeFile("node_modules/pkg/index.js");
		await writeFile("dist/sattel.js");
		await writeFile(".sattel/settings.json");

		expect(await listProjectFiles(TEMP_DIR)).toEqual(["keep.ts"]);
	});

	test("skips bare names listed in a top-level .gitignore", async () => {
		await writeFile("keep.ts");
		await writeFile("build/output.js");
		await writeFile(".gitignore", "build\n");

		expect(await listProjectFiles(TEMP_DIR)).toEqual([".gitignore", "keep.ts"]);
	});

	test("ignores blank lines and comments in .gitignore", async () => {
		await writeFile("keep.ts");
		await writeFile(".gitignore", "\n# a comment\n\n");

		expect(await listProjectFiles(TEMP_DIR)).toEqual([".gitignore", "keep.ts"]);
	});

	test("returns an empty array for an empty directory", async () => {
		expect(await listProjectFiles(TEMP_DIR)).toEqual([]);
	});
});
