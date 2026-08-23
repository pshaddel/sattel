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

	test('inserts a new line after its anchor with "insert-after"', async () => {
		const filePath = tempPath("insert-single.txt");
		await fs.promises.writeFile(filePath, "a\nb\nc", "utf8");

		await writeFileTool.function.execute({
			path: filePath,
			patch: [
				[1, "b"],
				["insert-after", "inserted"],
			],
		});

		const content = await fs.promises.readFile(filePath, "utf8");
		expect(content).toBe("a\nb\ninserted\nc");
	});

	test('chains multiple "insert-after" entries after the same anchor in order', async () => {
		const filePath = tempPath("insert-multiple.txt");
		await fs.promises.writeFile(filePath, "a\nb", "utf8");

		await writeFileTool.function.execute({
			path: filePath,
			patch: [
				[0, "a"],
				["insert-after", "first"],
				["insert-after", "second"],
			],
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
				[0, "a"],
				["insert-after", "inserted"],
				[2, "C"],
			],
		});

		const content = await fs.promises.readFile(filePath, "utf8");
		expect(content).toBe("a\ninserted\nb\nC");
	});

	test('throws when "insert-after" has no preceding numeric anchor', async () => {
		const filePath = tempPath("insert-no-anchor.txt");
		await fs.promises.writeFile(filePath, "a\nb", "utf8");

		await expect(
			writeFileTool.function.execute({
				path: filePath,
				patch: [["insert-after", "orphan"]],
			}),
		).rejects.toThrow(
			'An "insert-after" patch must come after a patch with a numeric line number to anchor it to.',
		);
	});

	test('re-anchors "insert-after" to each new numeric patch as it appears', async () => {
		const filePath = tempPath("insert-reanchor.txt");
		await fs.promises.writeFile(filePath, "a\nb\nc", "utf8");

		await writeFileTool.function.execute({
			path: filePath,
			patch: [
				[0, "a"],
				["insert-after", "a1"],
				[1, "b"],
				["insert-after", "b1"],
			],
		});

		const content = await fs.promises.readFile(filePath, "utf8");
		expect(content).toBe("a\na1\nb\nb1\nc");
	});

	test('does not treat an out-of-range numeric patch as an anchor for "insert-after"', async () => {
		const filePath = tempPath("insert-invalid-anchor.txt");
		await fs.promises.writeFile(filePath, "a\nb", "utf8");

		await expect(
			writeFileTool.function.execute({
				path: filePath,
				patch: [
					[10, "ignored"],
					["insert-after", "orphan"],
				],
			}),
		).rejects.toThrow(
			'An "insert-after" patch must come after a patch with a numeric line number to anchor it to.',
		);
	});

	test('appends "insert-after" content at the end of the file when anchored to the last line', async () => {
		const filePath = tempPath("insert-at-end.txt");
		await fs.promises.writeFile(filePath, "a\nb", "utf8");

		await writeFileTool.function.execute({
			path: filePath,
			patch: [
				[1, "b"],
				["insert-after", "c"],
			],
		});

		const content = await fs.promises.readFile(filePath, "utf8");
		expect(content).toBe("a\nb\nc");
	});

	test('creates a new file treating "insert-after" entries the same as numbered ones', async () => {
		const filePath = tempPath("insert-new-file.txt");

		await writeFileTool.function.execute({
			path: filePath,
			patch: [
				[0, "a"],
				["insert-after", "b"],
				[1, "c"],
			],
		});

		const content = await fs.promises.readFile(filePath, "utf8");
		expect(content).toBe("a\nb\nc");
	});
});
