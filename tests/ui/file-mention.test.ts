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

	test("matches case-insensitively on any substring of the path", () => {
		expect(matchingFiles("UI/FILE", files)).toEqual([
			{ name: "src/ui/file-mention.ts", description: "" },
		]);
	});

	test("returns the first N files for an empty query", () => {
		const result = matchingFiles("", files);
		expect(result.map((entry) => entry.name)).toEqual(files.slice(0, 4));
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
		expect(matchingFiles("./src/ui", files)).toEqual([
			{ name: "src/ui/command-palette.ts", description: "" },
			{ name: "src/ui/file-mention.ts", description: "" },
			{ name: "src/index.ts", description: "" },
		]);
	});

	test("strips repeated leading ./ segments before matching", () => {
		expect(matchingFiles("././index", files)).toEqual([
			{ name: "src/index.ts", description: "" },
		]);
	});

	test("treats a bare ./ query the same as an empty query", () => {
		const result = matchingFiles("./", files);
		expect(result.map((entry) => entry.name)).toEqual(files.slice(0, 4));
	});

	test("does not resolve a leading ../ and simply matches nothing", () => {
		expect(matchingFiles("../src", files)).toEqual([]);
	});

	test("returns an empty array for an empty file list", () => {
		expect(matchingFiles("src", [])).toEqual([]);
	});

	test("tolerates a transposed pair of letters", () => {
		expect(matchingFiles("fiel-mention", files)).toEqual([
			{ name: "src/ui/file-mention.ts", description: "" },
		]);
	});

	test("tolerates a missing letter", () => {
		expect(matchingFiles("comand-palette", files)).toEqual([
			{ name: "src/ui/command-palette.ts", description: "" },
		]);
	});

	test("tolerates a wrong letter", () => {
		expect(matchingFiles("indax", files)).toEqual([
			{ name: "src/index.ts", description: "" },
		]);
	});
});
