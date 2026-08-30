import { describe, expect, test } from "bun:test";
import {
	findActiveMentionToken,
	MAX_VISIBLE_FILES,
	matchingFiles,
} from "../../src/ui/file-mention";

describe("findActiveMentionToken", () => {
	test("finds a mention token at the very start of the input", () => {
		expect(findActiveMentionToken("@src/index.ts", 5)).toEqual({
			start: 0,
			end: 5,
			query: "src/",
		});
	});

	test("finds a mention token after whitespace", () => {
		expect(findActiveMentionToken("look at @src/index.ts", 13)).toEqual({
			start: 8,
			end: 13,
			query: "src/",
		});
	});

	test("returns null when there is no @ before the cursor", () => {
		expect(findActiveMentionToken("just plain text", 5)).toBeNull();
	});

	test("returns null once whitespace terminates the token", () => {
		expect(findActiveMentionToken("@src/index.ts done", 19)).toBeNull();
	});

	test("does not trigger on an @ embedded mid-word, e.g. an email address", () => {
		expect(findActiveMentionToken("email user@example.com", 15)).toBeNull();
	});

	test("returns null when the cursor sits before the @", () => {
		expect(findActiveMentionToken("hi @file.ts", 2)).toBeNull();
	});

	test("uses the nearest @ before the cursor when several are present", () => {
		expect(findActiveMentionToken("@a.ts @b.ts", 11)).toEqual({
			start: 6,
			end: 11,
			query: "b.ts",
		});
	});

	test("returns an empty query for a bare, just-typed @", () => {
		expect(findActiveMentionToken("@", 1)).toEqual({
			start: 0,
			end: 1,
			query: "",
		});
	});
});

describe("matchingFiles", () => {
	const files = [
		"src/index.ts",
		"src/ui/command-palette.ts",
		"src/ui/file-mention.ts",
		"README.md",
	];

	function names(query: string, list: string[]) {
		return matchingFiles(query, list).map((entry) => entry.name);
	}

	test("matches case-insensitively on any substring of the path", () => {
		expect(names("UI/FILE", files)).toEqual(["src/ui/file-mention.ts"]);
	});

	test("returns the first N files for an empty query", () => {
		expect(names("", files)).toEqual(files.slice(0, 4));
	});

	test("returns files with no matches and an empty description for an empty query", () => {
		expect(matchingFiles("", files)).toEqual(
			files.map((file) => ({ name: file, description: "" })),
		);
	});

	test("caps results at MAX_VISIBLE_FILES", () => {
		const manyFiles = Array.from(
			{ length: MAX_VISIBLE_FILES + 5 },
			(_, i) => `file${i}.ts`,
		);
		expect(matchingFiles("file", manyFiles)).toHaveLength(MAX_VISIBLE_FILES);
	});

	test("returns an empty array when nothing matches", () => {
		expect(matchingFiles("nonexistent", files)).toEqual([]);
	});

	test("strips a leading ./ before matching", () => {
		expect(names("./src/ui", files)).toEqual([
			"src/ui/command-palette.ts",
			"src/ui/file-mention.ts",
			"src/index.ts",
		]);
	});

	test("strips repeated leading ./ segments before matching", () => {
		expect(names("././index", files)).toEqual(["src/index.ts"]);
	});

	test("treats a bare ./ query the same as an empty query", () => {
		expect(names("./", files)).toEqual(files.slice(0, 4));
	});

	test("does not resolve a leading ../ and simply matches nothing", () => {
		expect(matchingFiles("../src", files)).toEqual([]);
	});

	test("returns an empty array for an empty file list", () => {
		expect(matchingFiles("src", [])).toEqual([]);
	});

	test("tolerates a transposed pair of letters", () => {
		expect(names("fiel-mention", files)).toEqual(["src/ui/file-mention.ts"]);
	});

	test("tolerates a missing letter", () => {
		expect(names("comand-palette", files)).toEqual([
			"src/ui/command-palette.ts",
		]);
	});

	test("tolerates a wrong letter", () => {
		expect(names("indax", files)).toEqual(["src/index.ts"]);
	});

	test("includes the matched character ranges for highlighting", () => {
		const [result] = matchingFiles("UI/FILE", files);
		expect(result?.matches).toEqual([[4, 10]]);
		expect(result?.name.slice(4, 11)).toBe("ui/file");
	});

	test("still includes matched ranges for a fuzzy (typo) match", () => {
		const [result] = matchingFiles("indax", files);
		expect(result?.matches).toBeDefined();
		expect(result?.matches?.length).toBeGreaterThan(0);
	});
});
