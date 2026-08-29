import { describe, expect, test } from "bun:test";
import { formatProjectInstructions } from "../../src/context/projectInstructions";
import { SYSTEM_PROMPT, buildInstructions } from "../../src/llm/llm";

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
