import { describe, expect, test } from "bun:test";
import { formatProjectInstructions } from "../../src/context/projectInstructions";
import {
	buildInstructions,
	buildSessionTitlePrompt,
	SYSTEM_PROMPT,
	sanitizeTitle,
} from "../../src/llm/llm";

describe("SYSTEM_PROMPT", () => {
	test("frames the agent's identity", () => {
		expect(SYSTEM_PROMPT).toContain("Sattel");
	});
});

describe("buildInstructions", () => {
	test("returns the system prompt unchanged when there are no project instructions", () => {
		expect(buildInstructions(undefined)).toBe(SYSTEM_PROMPT);
	});

	test("appends formatted project instructions when present", () => {
		expect(buildInstructions("do the thing")).toBe(
			`${SYSTEM_PROMPT}\n\n${formatProjectInstructions("do the thing")}`,
		);
	});
});

describe("buildSessionTitlePrompt", () => {
	test("includes the first user message", () => {
		expect(buildSessionTitlePrompt("refactor auth.ts to use JWT")).toContain(
			"refactor auth.ts to use JWT",
		);
	});

	test("omits the assistant section when not given", () => {
		expect(buildSessionTitlePrompt("do the thing")).not.toContain("Assistant:");
	});

	test("includes the assistant section when given", () => {
		expect(
			buildSessionTitlePrompt("do the thing", "done, updated auth.ts"),
		).toContain("Assistant: done, updated auth.ts");
	});
});

describe("sanitizeTitle", () => {
	test("trims surrounding whitespace", () => {
		expect(sanitizeTitle("  Refactor auth  ")).toBe("Refactor auth");
	});

	test("strips one layer of wrapping quotes", () => {
		expect(sanitizeTitle('"Refactor auth to use JWT"')).toBe(
			"Refactor auth to use JWT",
		);
	});

	test("collapses internal whitespace and newlines", () => {
		expect(sanitizeTitle("Refactor\n  auth   module")).toBe(
			"Refactor auth module",
		);
	});

	test("strips trailing punctuation", () => {
		expect(sanitizeTitle("Refactor auth module.")).toBe("Refactor auth module");
	});

	test("returns undefined for an empty or whitespace-only result", () => {
		expect(sanitizeTitle("")).toBeUndefined();
		expect(sanitizeTitle("   ")).toBeUndefined();
		expect(sanitizeTitle('"."')).toBeUndefined();
	});

	test("truncates an overlong title at a word boundary", () => {
		const raw = `${"a".repeat(10)} ${"b".repeat(60)}`;
		const result = sanitizeTitle(raw);
		expect(result?.length).toBeLessThanOrEqual(60);
		expect(result?.endsWith("a".repeat(10))).toBe(true);
	});
});
