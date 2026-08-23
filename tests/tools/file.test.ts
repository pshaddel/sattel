import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
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
	test("creates a new file when it does not exist", async () => {
		const filePath = tempPath("new-file.txt");

		const message = await writeFileTool.function.execute({
			path: filePath,
			patch: [
				[0, "hello"],
				[1, "world"],
			],
		});

		const content = await fs.promises.readFile(filePath, "utf8");
		expect(content).toBe("hello\nworld");
		expect(message).toBe(
			`File at path ${filePath} has been updated successfully.`,
		);
	});

	test("updates specific lines of an existing file", async () => {
		const filePath = tempPath("existing.txt");
		await fs.promises.writeFile(filePath, "a\nb\nc", "utf8");

		await writeFileTool.function.execute({
			path: filePath,
			patch: [[1, "B"]],
		});

		const content = await fs.promises.readFile(filePath, "utf8");
		expect(content).toBe("a\nB\nc");
	});

	test("ignores patch entries with an out-of-range line number", async () => {
		const filePath = tempPath("out-of-range.txt");
		await fs.promises.writeFile(filePath, "a\nb", "utf8");

		await writeFileTool.function.execute({
			path: filePath,
			patch: [[5, "z"]],
		});

		const content = await fs.promises.readFile(filePath, "utf8");
		expect(content).toBe("a\nb");
	});

	test("ignores patch entries with a negative line number", async () => {
		const filePath = tempPath("negative.txt");
		await fs.promises.writeFile(filePath, "a\nb", "utf8");

		await writeFileTool.function.execute({
			path: filePath,
			patch: [[-1, "z"]],
		});

		const content = await fs.promises.readFile(filePath, "utf8");
		expect(content).toBe("a\nb");
	});

	test("inserts a new line after the specified line via a third tuple element", async () => {
		const filePath = tempPath("insert-single.txt");
		await fs.promises.writeFile(filePath, "a\nb\nc", "utf8");

		await writeFileTool.function.execute({
			path: filePath,
			patch: [[1, "b", "inserted"]],
		});

		const content = await fs.promises.readFile(filePath, "utf8");
		expect(content).toBe("a\nb\ninserted\nc");
	});

	test("inserts multiple new lines in order via multiple extra tuple elements", async () => {
		const filePath = tempPath("insert-multiple.txt");
		await fs.promises.writeFile(filePath, "a\nb", "utf8");

		await writeFileTool.function.execute({
			path: filePath,
			patch: [[0, "a", "first", "second"]],
		});

		const content = await fs.promises.readFile(filePath, "utf8");
		expect(content).toBe("a\nfirst\nsecond\nb");
	});

	test("keeps later numeric patches pointed at their original line after an insert", async () => {
		const filePath = tempPath("insert-preserves-indices.txt");
		await fs.promises.writeFile(filePath, "a\nb\nc", "utf8");

		await writeFileTool.function.execute({
			path: filePath,
			patch: [
				[0, "a", "inserted"],
				[2, "C"],
			],
		});

		const content = await fs.promises.readFile(filePath, "utf8");
		expect(content).toBe("a\ninserted\nb\nC");
	});

	test("appends new lines at the end of the file when the patch targets the last line", async () => {
		const filePath = tempPath("insert-at-end.txt");
		await fs.promises.writeFile(filePath, "a\nb", "utf8");

		await writeFileTool.function.execute({
			path: filePath,
			patch: [[1, "b", "c"]],
		});

		const content = await fs.promises.readFile(filePath, "utf8");
		expect(content).toBe("a\nb\nc");
	});

	test("creates a new file inserting extra lines from a patch with more than two elements", async () => {
		const filePath = tempPath("insert-new-file.txt");

		await writeFileTool.function.execute({
			path: filePath,
			patch: [
				[0, "a", "b"],
				[1, "c"],
			],
		});

		const content = await fs.promises.readFile(filePath, "utf8");
		expect(content).toBe("a\nb\nc");
	});

	test("rejects a patch entry whose first element is not a number", () => {
		const result = writeFileTool.function.inputSchema.safeParse({
			path: "irrelevant.txt",
			patch: [["not-a-number", "content"]],
		});

		expect(result.success).toBe(false);
		expect(result.success ? undefined : result.error.issues).toContainEqual(
			expect.objectContaining({
				code: "invalid_type",
				expected: "number",
				path: ["patch", 0, 0],
			}),
		);
	});

	test("rejects a patch entry missing the required content element", () => {
		const result = writeFileTool.function.inputSchema.safeParse({
			path: "irrelevant.txt",
			patch: [[1]],
		});

		expect(result.success).toBe(false);
		expect(result.success ? undefined : result.error.issues).toContainEqual(
			expect.objectContaining({
				code: "invalid_type",
				expected: "string",
				path: ["patch", 0, 1],
			}),
		);
	});
});
