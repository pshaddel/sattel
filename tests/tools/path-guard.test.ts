import { describe, expect, test } from "bun:test";
import {
	isPathWithinRoot,
	resolveWithinRoot,
} from "../../src/tools/path-guard";

const ROOT = "/project";

describe("resolveWithinRoot / isPathWithinRoot", () => {
	test("allows a nested relative subdirectory", () => {
		expect(isPathWithinRoot("src/index.ts", ROOT)).toBe(true);
		expect(resolveWithinRoot("src/index.ts", ROOT)).toBe(
			"/project/src/index.ts",
		);
	});

	test("allows a deeply nested relative path", () => {
		expect(isPathWithinRoot("a/b/c/d.txt", ROOT)).toBe(true);
	});

	test("allows the root itself via '.'", () => {
		expect(isPathWithinRoot(".", ROOT)).toBe(true);
		expect(resolveWithinRoot(".", ROOT)).toBe("/project");
	});

	test("allows the root itself via an empty string", () => {
		expect(isPathWithinRoot("", ROOT)).toBe(true);
	});

	test("allows the root itself as an exact absolute path", () => {
		expect(isPathWithinRoot("/project", ROOT)).toBe(true);
	});

	test("allows an absolute path nested inside root", () => {
		expect(isPathWithinRoot("/project/src/index.ts", ROOT)).toBe(true);
	});

	test("blocks a single-level relative parent escape", () => {
		expect(isPathWithinRoot("../secret.txt", ROOT)).toBe(false);
		expect(resolveWithinRoot("../secret.txt", ROOT)).toBeNull();
	});

	test("blocks a multi-level relative parent escape", () => {
		expect(isPathWithinRoot("../../etc/passwd", ROOT)).toBe(false);
	});

	test("blocks an absolute path outside root entirely", () => {
		expect(isPathWithinRoot("/etc/passwd", ROOT)).toBe(false);
	});

	test("blocks a sibling directory that merely shares root's name as a string prefix", () => {
		// A naive `candidate.startsWith(root)` check would wrongly allow this,
		// since "/project-other" starts with "/project" as a substring.
		expect(isPathWithinRoot("/project-other/file.txt", ROOT)).toBe(false);
	});

	test("allows traversal that nets back inside root", () => {
		expect(isPathWithinRoot("sub/../other/file.txt", ROOT)).toBe(true);
		expect(resolveWithinRoot("sub/../other/file.txt", ROOT)).toBe(
			"/project/other/file.txt",
		);
	});

	test("blocks traversal that nets outside root even via a nested-looking path", () => {
		expect(isPathWithinRoot("sub/../../outside.txt", ROOT)).toBe(false);
	});

	test("allows a nested path with a trailing slash", () => {
		expect(isPathWithinRoot("sub/", ROOT)).toBe(true);
	});

	test("allows a nested path with redundant './' segments", () => {
		expect(isPathWithinRoot("./sub/./file.txt", ROOT)).toBe(true);
	});

	test("treats a leading '~' as a literal path segment, not a shell home-dir expansion", () => {
		// There is no shell in the loop (Bun.spawn execs directly), so "~" is
		// never expanded — it resolves to a literal directory named "~" inside root.
		expect(resolveWithinRoot("~/file.txt", ROOT)).toBe("/project/~/file.txt");
		expect(isPathWithinRoot("~/file.txt", ROOT)).toBe(true);
	});

	test("normalizes a root with a trailing slash", () => {
		expect(isPathWithinRoot("file.txt", "/project/")).toBe(true);
		expect(resolveWithinRoot("file.txt", "/project/")).toBe(
			"/project/file.txt",
		);
	});

	test("defaults root to process.cwd() when omitted", () => {
		expect(isPathWithinRoot("some/nested/file.txt")).toBe(true);
		expect(isPathWithinRoot("../../outside.txt")).toBe(false);
	});
});
