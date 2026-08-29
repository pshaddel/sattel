import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
	formatProjectInstructions,
	loadProjectInstructions,
} from "../../src/context/projectInstructions";

const TEMP_DIR = path.join(import.meta.dir, "temp");

function tempPath(name: string) {
	return path.join(TEMP_DIR, name);
}

beforeEach(async () => {
	await fs.promises.mkdir(TEMP_DIR, { recursive: true });
});

afterEach(async () => {
	await fs.promises.rm(TEMP_DIR, { recursive: true, force: true });
});

describe("loadProjectInstructions", () => {
	test("returns CLAUDE.md's contents when only CLAUDE.md exists", async () => {
		await fs.promises.writeFile(
			tempPath("CLAUDE.md"),
			"claude instructions",
			"utf8",
		);

		expect(loadProjectInstructions(TEMP_DIR)).toBe("claude instructions");
	});

	test("falls back to AGENTS.md's contents when CLAUDE.md doesn't exist", async () => {
		await fs.promises.writeFile(
			tempPath("AGENTS.md"),
			"agents instructions",
			"utf8",
		);

		expect(loadProjectInstructions(TEMP_DIR)).toBe("agents instructions");
	});

	test("prefers CLAUDE.md over AGENTS.md when both exist", async () => {
		await fs.promises.writeFile(
			tempPath("CLAUDE.md"),
			"claude instructions",
			"utf8",
		);
		await fs.promises.writeFile(
			tempPath("AGENTS.md"),
			"agents instructions",
			"utf8",
		);

		expect(loadProjectInstructions(TEMP_DIR)).toBe("claude instructions");
	});

	test("returns undefined without throwing when neither file exists", () => {
		expect(loadProjectInstructions(TEMP_DIR)).toBeUndefined();
	});
});

describe("formatProjectInstructions", () => {
	test("wraps content in a delimited project-instructions section", () => {
		expect(formatProjectInstructions("do the thing")).toBe(
			"Project instructions:\n\ndo the thing",
		);
	});

	test("returns undefined when given undefined", () => {
		expect(formatProjectInstructions(undefined)).toBeUndefined();
	});
});
