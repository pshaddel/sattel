import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import type { z } from "zod";
import { readFileTool, writeFileTool } from "../../src/tools/file";

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

describe("readFileTool", () => {
	test("reads all lines when no sections are provided", async () => {
		const filePath = tempPath("full.txt");
		await fs.promises.writeFile(filePath, "line0\nline1\nline2", "utf8");

		const result = await readFileTool.function.execute({ path: filePath });

		expect(result).toEqual([
			[0, "line0"],
			[1, "line1"],
			[2, "line2"],
		]);
	});

	test("reads only the requested section", async () => {
		const filePath = tempPath("section.txt");
		await fs.promises.writeFile(filePath, "line0\nline1\nline2\nline3", "utf8");

		const result = await readFileTool.function.execute({
			path: filePath,
			sections: [[1, 2]],
		});

		expect(result).toEqual([
			[1, "line1"],
			[2, "line2"],
		]);
	});

	test("reads multiple sections and concatenates them in order", async () => {
		const filePath = tempPath("multi-section.txt");
		await fs.promises.writeFile(filePath, "line0\nline1\nline2\nline3", "utf8");

		const result = await readFileTool.function.execute({
			path: filePath,
			sections: [
				[0, 0],
				[2, 3],
			],
		});

		expect(result).toEqual([
			[0, "line0"],
			[2, "line2"],
			[3, "line3"],
		]);
	});

	test("clamps a section end that exceeds the file length", async () => {
		const filePath = tempPath("clamped.txt");
		await fs.promises.writeFile(filePath, "line0\nline1", "utf8");

		const result = await readFileTool.function.execute({
			path: filePath,
			sections: [[0, 10]],
		});

		expect(result).toEqual([
			[0, "line0"],
			[1, "line1"],
		]);
	});

	test("throws a not-found error for a missing file", async () => {
		const filePath = tempPath("does-not-exist.txt");

		await expect(
			readFileTool.function.execute({ path: filePath }),
		).rejects.toThrow(`File at path ${filePath} not found.`);
	});

	test("throws an error when the file is empty", async () => {
		const filePath = tempPath("empty.txt");
		await fs.promises.writeFile(filePath, "", "utf8");

		await expect(
			readFileTool.function.execute({ path: filePath }),
		).rejects.toThrow(
			`File at path ${filePath} is empty or could not be read.`,
		);
	});
});

describe("writeFileTool", () => {
	describe("replace", () => {
		test("replaces an exact snippet in an existing file", async () => {
			const filePath = tempPath("existing.txt");
			await fs.promises.writeFile(filePath, "a\nb\nc", "utf8");

			const message = await writeFileTool.function.execute({
				path: filePath,
				edits: [{ old_string: "b", new_string: "B" }],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("a\nB\nc");
			expect(message).toBe(
				`File at path ${filePath} has been updated successfully.`,
			);
		});

		test("applies multiple edits in order against progressively-updated content", async () => {
			const filePath = tempPath("multi-replace.txt");
			await fs.promises.writeFile(filePath, "a\nb\nc", "utf8");

			await writeFileTool.function.execute({
				path: filePath,
				edits: [
					{ old_string: "a", new_string: "A" },
					{ old_string: "c", new_string: "C" },
				],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("A\nb\nC");
		});

		test("throws when old_string is not found, leaving the file unchanged", async () => {
			const filePath = tempPath("not-found.txt");
			await fs.promises.writeFile(filePath, "a\nb\nc", "utf8");

			await expect(
				writeFileTool.function.execute({
					path: filePath,
					edits: [{ old_string: "does-not-exist", new_string: "x" }],
				}),
			).rejects.toThrow(`old_string not found in ${filePath}`);

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("a\nb\nc");
		});

		test("throws when old_string matches more than once", async () => {
			const filePath = tempPath("ambiguous.txt");
			await fs.promises.writeFile(filePath, "dup\nb\ndup", "utf8");

			await expect(
				writeFileTool.function.execute({
					path: filePath,
					edits: [{ old_string: "dup", new_string: "x" }],
				}),
			).rejects.toThrow(/matches more than once/);
		});
	});

	describe("insert (expressed as a replace whose new_string extends old_string)", () => {
		test("inserts a new line right after an anchor line", async () => {
			const filePath = tempPath("insert-single.txt");
			await fs.promises.writeFile(filePath, "a\nb\nc", "utf8");

			await writeFileTool.function.execute({
				path: filePath,
				edits: [{ old_string: "b", new_string: "b\ninserted" }],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("a\nb\ninserted\nc");
		});

		test('appends content at the end of the file via old_string: ""', async () => {
			const filePath = tempPath("append.txt");
			await fs.promises.writeFile(filePath, "a\nb", "utf8");

			await writeFileTool.function.execute({
				path: filePath,
				edits: [{ old_string: "", new_string: "\nc" }],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("a\nb\nc");
		});
	});

	describe('delete (expressed as a replace with new_string: "")', () => {
		test("deletes a single line", async () => {
			const filePath = tempPath("delete-single.txt");
			await fs.promises.writeFile(filePath, "a\nb\nc", "utf8");

			await writeFileTool.function.execute({
				path: filePath,
				edits: [{ old_string: "b\n", new_string: "" }],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("a\nc");
		});

		test("deletes a whole multi-line block in one edit", async () => {
			const filePath = tempPath("delete-block.txt");
			await fs.promises.writeFile(filePath, "a\nb\nc\nd\ne", "utf8");

			await writeFileTool.function.execute({
				path: filePath,
				edits: [{ old_string: "b\nc\nd\n", new_string: "" }],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("a\ne");
		});

		test("combines a replace and a delete in the same edits array", async () => {
			const filePath = tempPath("delete-and-replace.txt");
			await fs.promises.writeFile(filePath, "a\nb\nc", "utf8");

			await writeFileTool.function.execute({
				path: filePath,
				edits: [
					{ old_string: "a", new_string: "A" },
					{ old_string: "b\n", new_string: "" },
				],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("A\nc");
		});
	});

	describe("replace_all", () => {
		test("replaces every occurrence when replace_all is true", async () => {
			const filePath = tempPath("replace-all.txt");
			await fs.promises.writeFile(filePath, "foo bar foo baz foo", "utf8");

			await writeFileTool.function.execute({
				path: filePath,
				edits: [{ old_string: "foo", new_string: "qux", replace_all: true }],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("qux bar qux baz qux");
		});

		test("without replace_all, throws instead of guessing which occurrence to use", async () => {
			const filePath = tempPath("replace-all-required.txt");
			await fs.promises.writeFile(filePath, "foo bar foo", "utf8");

			await expect(
				writeFileTool.function.execute({
					path: filePath,
					edits: [{ old_string: "foo", new_string: "qux" }],
				}),
			).rejects.toThrow(/matches more than once/);
		});
	});

	describe("file creation", () => {
		test("creates a new file from append-style edits when it does not exist", async () => {
			const filePath = tempPath("new-file.txt");

			const message = await writeFileTool.function.execute({
				path: filePath,
				edits: [
					{ old_string: "", new_string: "hello\n" },
					{ old_string: "", new_string: "world" },
				],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("hello\nworld");
			expect(message).toBe(
				`File at path ${filePath} has been updated successfully.`,
			);
		});

		test("ignores non-append edits when creating a new file", async () => {
			const filePath = tempPath("mixed-new-file.txt");

			await writeFileTool.function.execute({
				path: filePath,
				edits: [
					{ old_string: "", new_string: "a\n" },
					{ old_string: "unrelated", new_string: "ignored" },
					{ old_string: "", new_string: "b" },
				],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("a\nb");
		});
	});

	describe("validation", () => {
		function flattenIssues(issues: z.core.$ZodIssue[]): z.core.$ZodIssue[] {
			return issues.flatMap((issue) =>
				issue.code === "invalid_union" ? issue.errors.flat() : [issue],
			);
		}

		test("rejects an edit missing new_string", () => {
			const result = writeFileTool.function.inputSchema.safeParse({
				path: "irrelevant.txt",
				edits: [{ old_string: "a" }],
			});

			expect(result.success).toBe(false);
			expect(
				result.success ? [] : flattenIssues(result.error.issues),
			).toContainEqual(
				expect.objectContaining({ code: "invalid_type", expected: "string" }),
			);
		});

		test("rejects a non-boolean replace_all", () => {
			const result = writeFileTool.function.inputSchema.safeParse({
				path: "irrelevant.txt",
				edits: [{ old_string: "a", new_string: "b", replace_all: "yes" }],
			});

			expect(result.success).toBe(false);
		});

		test("accepts a minimal valid edit", () => {
			const result = writeFileTool.function.inputSchema.safeParse({
				path: "irrelevant.txt",
				edits: [{ old_string: "a", new_string: "b" }],
			});

			expect(result.success).toBe(true);
		});

		test("accepts an edit with replace_all set", () => {
			const result = writeFileTool.function.inputSchema.safeParse({
				path: "irrelevant.txt",
				edits: [{ old_string: "a", new_string: "b", replace_all: true }],
			});

			expect(result.success).toBe(true);
		});
	});
});
