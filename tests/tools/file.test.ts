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
	function flattenIssues(issues: z.core.$ZodIssue[]): z.core.$ZodIssue[] {
		return issues.flatMap((issue) =>
			issue.code === "invalid_union" ? issue.errors.flat() : [issue],
		);
	}

	describe("replace", () => {
		test("creates a new file from replace patches when it does not exist", async () => {
			const filePath = tempPath("new-file.txt");

			const message = await writeFileTool.function.execute({
				path: filePath,
				patch: [
					["replace", 0, "hello"],
					["replace", 1, "world"],
				],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("hello\nworld");
			expect(message).toBe(
				`File at path ${filePath} has been updated successfully.`,
			);
		});

		test("updates a specific line of an existing file", async () => {
			const filePath = tempPath("existing.txt");
			await fs.promises.writeFile(filePath, "a\nb\nc", "utf8");

			await writeFileTool.function.execute({
				path: filePath,
				patch: [["replace", 1, "B"]],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("a\nB\nc");
		});

		test("ignores a replace for an out-of-range line number", async () => {
			const filePath = tempPath("out-of-range.txt");
			await fs.promises.writeFile(filePath, "a\nb", "utf8");

			await writeFileTool.function.execute({
				path: filePath,
				patch: [["replace", 5, "z"]],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("a\nb");
		});

		test("ignores a replace for a negative line number", async () => {
			const filePath = tempPath("negative.txt");
			await fs.promises.writeFile(filePath, "a\nb", "utf8");

			await writeFileTool.function.execute({
				path: filePath,
				patch: [["replace", -1, "z"]],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("a\nb");
		});

		test("creates a new file ignoring non-replace entries", async () => {
			const filePath = tempPath("mixed-new-file.txt");

			await writeFileTool.function.execute({
				path: filePath,
				patch: [
					["replace", 0, "a"],
					["delete", 5],
					["insert-after", 0, "ignored"],
					["replace", 1, "b"],
				],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("a\nb");
		});
	});

	describe("insert-after", () => {
		test("inserts a single new line right after the specified line", async () => {
			const filePath = tempPath("insert-single.txt");
			await fs.promises.writeFile(filePath, "a\nb\nc", "utf8");

			await writeFileTool.function.execute({
				path: filePath,
				patch: [["insert-after", 1, "inserted"]],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("a\nb\ninserted\nc");
		});

		test("inserts multiple new lines at once via \\n-separated content", async () => {
			const filePath = tempPath("insert-multi.txt");
			await fs.promises.writeFile(filePath, "a\nb", "utf8");

			await writeFileTool.function.execute({
				path: filePath,
				patch: [["insert-after", 0, "first\nsecond"]],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("a\nfirst\nsecond\nb");
		});

		test("chains multiple insert-after patches targeting the same line in order", async () => {
			const filePath = tempPath("insert-chain.txt");
			await fs.promises.writeFile(filePath, "a\nb", "utf8");

			await writeFileTool.function.execute({
				path: filePath,
				patch: [
					["insert-after", 0, "first"],
					["insert-after", 0, "second"],
				],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("a\nfirst\nsecond\nb");
		});

		test("appends new lines at the end of the file when targeting the last line", async () => {
			const filePath = tempPath("insert-at-end.txt");
			await fs.promises.writeFile(filePath, "a\nb", "utf8");

			await writeFileTool.function.execute({
				path: filePath,
				patch: [["insert-after", 1, "c"]],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("a\nb\nc");
		});

		test("keeps other patches pointed at their original line after an insert", async () => {
			const filePath = tempPath("insert-preserves-indices.txt");
			await fs.promises.writeFile(filePath, "a\nb\nc", "utf8");

			await writeFileTool.function.execute({
				path: filePath,
				patch: [
					["insert-after", 0, "inserted"],
					["replace", 2, "C"],
				],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("a\ninserted\nb\nC");
		});

		test("ignores an insert-after for an out-of-range line number", async () => {
			const filePath = tempPath("insert-out-of-range.txt");
			await fs.promises.writeFile(filePath, "a\nb", "utf8");

			await writeFileTool.function.execute({
				path: filePath,
				patch: [["insert-after", 10, "ignored"]],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("a\nb");
		});
	});

	describe("delete", () => {
		test("deletes a single line", async () => {
			const filePath = tempPath("delete-single.txt");
			await fs.promises.writeFile(filePath, "a\nb\nc", "utf8");

			await writeFileTool.function.execute({
				path: filePath,
				patch: [["delete", 1]],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("a\nc");
		});

		test("deletes multiple lines given as separate patches", async () => {
			const filePath = tempPath("delete-multiple.txt");
			await fs.promises.writeFile(filePath, "a\nb\nc", "utf8");

			await writeFileTool.function.execute({
				path: filePath,
				patch: [
					["delete", 0],
					["delete", 2],
				],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("b");
		});

		test("combines a replace and a delete in the same patch array", async () => {
			const filePath = tempPath("delete-and-replace.txt");
			await fs.promises.writeFile(filePath, "a\nb\nc", "utf8");

			await writeFileTool.function.execute({
				path: filePath,
				patch: [
					["replace", 0, "A"],
					["delete", 1],
				],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("A\nc");
		});

		test("ignores a delete for an out-of-range line number", async () => {
			const filePath = tempPath("delete-out-of-range.txt");
			await fs.promises.writeFile(filePath, "a\nb", "utf8");

			await writeFileTool.function.execute({
				path: filePath,
				patch: [["delete", 10]],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("a\nb");
		});

		test("ignores a delete for a negative line number", async () => {
			const filePath = tempPath("delete-negative.txt");
			await fs.promises.writeFile(filePath, "a\nb", "utf8");

			await writeFileTool.function.execute({
				path: filePath,
				patch: [["delete", -1]],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("a\nb");
		});
	});

	describe("delete-section", () => {
		test("deletes an inclusive range of lines", async () => {
			const filePath = tempPath("delete-section.txt");
			await fs.promises.writeFile(filePath, "a\nb\nc\nd", "utf8");

			await writeFileTool.function.execute({
				path: filePath,
				patch: [["delete-section", 1, 2]],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("a\nd");
		});

		test("combines with an insert-after targeting a line before the deleted section", async () => {
			const filePath = tempPath("delete-section-insert.txt");
			await fs.promises.writeFile(filePath, "a\nb\nc\nd", "utf8");

			await writeFileTool.function.execute({
				path: filePath,
				patch: [
					["insert-after", 0, "x"],
					["delete-section", 1, 2],
				],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("a\nx\nd");
		});

		test("clamps a range that extends past the start and end of the file", async () => {
			const filePath = tempPath("delete-section-clamped.txt");
			await fs.promises.writeFile(filePath, "a\nb", "utf8");

			await writeFileTool.function.execute({
				path: filePath,
				patch: [["delete-section", -5, 10]],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("");
		});

		test("is a no-op when the start comes after the end", async () => {
			const filePath = tempPath("delete-section-invalid-range.txt");
			await fs.promises.writeFile(filePath, "a\nb\nc", "utf8");

			await writeFileTool.function.execute({
				path: filePath,
				patch: [["delete-section", 2, 0]],
			});

			const content = await fs.promises.readFile(filePath, "utf8");
			expect(content).toBe("a\nb\nc");
		});
	});

	describe("validation", () => {
		test("rejects an unknown mode", () => {
			const result = writeFileTool.function.inputSchema.safeParse({
				path: "irrelevant.txt",
				patch: [["overwrite", 1, "content"]],
			});

			expect(result.success).toBe(false);
		});

		test("rejects a replace patch whose line number is not a number", () => {
			const result = writeFileTool.function.inputSchema.safeParse({
				path: "irrelevant.txt",
				patch: [["replace", "not-a-number", "content"]],
			});

			expect(result.success).toBe(false);
			expect(
				result.success ? [] : flattenIssues(result.error.issues),
			).toContainEqual(
				expect.objectContaining({ code: "invalid_type", expected: "number" }),
			);
		});

		test("rejects a delete patch with an extra element", () => {
			const result = writeFileTool.function.inputSchema.safeParse({
				path: "irrelevant.txt",
				patch: [["delete", 1, "extra"]],
			});

			expect(result.success).toBe(false);
		});

		test("accepts one valid patch of each mode", () => {
			const result = writeFileTool.function.inputSchema.safeParse({
				path: "irrelevant.txt",
				patch: [
					["replace", 0, "content"],
					["insert-after", 0, "content"],
					["delete", 0],
					["delete-section", 0, 1],
				],
			});

			expect(result.success).toBe(true);
		});
	});
});
