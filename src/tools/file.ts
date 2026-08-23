import fs from "node:fs";
import { tool } from "@openrouter/agent";
import { z } from "zod";

type FileSection = [number, number];
type FileSections = FileSection[];
type FileOutput = [number, string][];
/**
 * Reads a file and returns its content based on specified sections.
 * @param path - The path to the file to be read.
 * @param sections - Optional array of sections to read from the file. Each section is defined by a start and end line number.
 * @returns A promise that resolves to an array of tuples, where each tuple contains a line number and the corresponding line content.
 * @throws Will throw an error if the file cannot be read or if it is empty.
 */
async function readFileExecution(path: string, sections?: FileSections) {
	try {
		const fileContent = await fs.promises.readFile(path, "utf8");
		if (!fileContent) {
			throw new Error(`File at path ${path} is empty or could not be read.`);
		}

		if (!sections || sections.length === 0) {
			const lines = fileContent.split("\n");
			const output: FileOutput = [];
			for (let i = 0; i < lines.length; i++) {
				output.push([i, lines[i]]);
			}
			return output;
		} else {
			const lines = fileContent.split("\n");
			const output: FileOutput = [];
			for (const [start, end] of sections) {
				for (let i = start; i <= end && i < lines.length; i++) {
					output.push([i, lines[i]]);
				}
			}
			return output;
		}
	} catch (error) {
		// not found error
		if (
			error instanceof Error &&
			(error as NodeJS.ErrnoException).code === "ENOENT"
		) {
			throw new Error(`File at path ${path} not found.`);
		} else {
			console.error(`Error reading file at path ${path}:`, error);
			throw error;
		}
	}
}

export const readFileTool = tool({
	name: "readFile",
	description:
		"Reads a file and returns its content based on specified sections.",
	inputSchema: z.object({
		path: z.string().describe("The path to the file to be read."),
		sections: z
			.array(z.tuple([z.number(), z.number()]))
			.optional()
			.describe(
				"Optional array of sections to read from the file. Each section is defined by a start and end line number.",
			),
	}),
	outputSchema: z.array(
		z.tuple([
			z.number().describe("The line number."),
			z.string().describe("The content of the line."),
		]),
	),
	execute: async ({ path, sections }) => {
		return await readFileExecution(path, sections);
	},
});
// TODO: future: permission to the path check
// TODO: can we read a file just method names?
// TODO: How about method map or something like that?

type ReplacePatch = ["replace", number, string];
type InsertAfterPatch = ["insert-after", number, string];
type DeletePatch = ["delete", number];
type DeleteSectionPatch = ["delete-section", number, number];
type FilePatch =
	| ReplacePatch
	| InsertAfterPatch
	| DeletePatch
	| DeleteSectionPatch;

async function writeFileExecution(path: string, patch: FilePatch[]) {
	try {
		const fileContent = await fs.promises.readFile(path, "utf8");
		if (!fileContent) {
			throw new Error(`File at path ${path} is empty or could not be read.`);
		}

		const lines = fileContent.split("\n");
		const lineNumbersToDelete = new Set<number>();
		const insertionsAfterLine = new Map<number, string[]>();

		for (const entry of patch) {
			const mode = entry[0];
			if (mode === "delete-section") {
				const [, startLineNumber, endLineNumber] = entry;
				for (
					let i = Math.max(startLineNumber, 0);
					i <= endLineNumber && i < lines.length;
					i++
				) {
					lineNumbersToDelete.add(i);
				}
				continue;
			}

			const lineNumber = entry[1];
			if (lineNumber < 0 || lineNumber >= lines.length) {
				continue;
			}
			if (mode === "replace") {
				lines[lineNumber] = entry[2];
			} else if (mode === "delete") {
				lineNumbersToDelete.add(lineNumber);
			} else if (mode === "insert-after") {
				const existing = insertionsAfterLine.get(lineNumber) ?? [];
				existing.push(...entry[2].split("\n"));
				insertionsAfterLine.set(lineNumber, existing);
			}
		}

		const finalLines: string[] = [];
		for (let i = 0; i < lines.length; i++) {
			if (!lineNumbersToDelete.has(i)) {
				finalLines.push(lines[i]);
			}
			const insertions = insertionsAfterLine.get(i);
			if (insertions) {
				finalLines.push(...insertions);
			}
		}

		await fs.promises.writeFile(path, finalLines.join("\n"), "utf8");
	} catch (error) {
		if (
			error instanceof Error &&
			(error as NodeJS.ErrnoException).code === "ENOENT"
		) {
			// create the file from the "replace" patches only — the other modes
			// (insert-after/delete/delete-section) don't make sense against a file
			// that doesn't exist yet, so they're ignored here.
			const content = patch
				.filter((entry): entry is ReplacePatch => entry[0] === "replace")
				.map((entry) => entry[2])
				.join("\n");
			await fs.promises.writeFile(path, content, "utf8");
			return;
		} else {
			console.error(`Error writing file at path ${path}:`, error);
			throw error;
		}
	}
}

export const writeFileTool = tool({
	name: "writeFile",
	description:
		'Writes to a file based on specified patches. Each patch starts with a mode: ["replace", lineNumber, content] replaces a line\'s content; ["insert-after", lineNumber, content] inserts brand-new line(s) right after lineNumber (use "\\n" inside content for more than one); ["delete", lineNumber] removes a single line; ["delete-section", startLineNumber, endLineNumber] removes an inclusive range of lines. If the file does not exist, it is created from the "replace" patches only.',
	inputSchema: z.object({
		path: z.string().describe("The path to the file to be written."),
		patch: z
			.array(
				z.union([
					z.tuple([
						z.literal("replace"),
						z.number().describe("The line number to replace."),
						z.string().describe("The new content for that line."),
					]),
					z.tuple([
						z.literal("insert-after"),
						z
							.number()
							.describe("Insert the new line(s) right after this line."),
						z
							.string()
							.describe(
								'The content to insert. Include "\\n" to insert more than one new line at once.',
							),
					]),
					z.tuple([
						z.literal("delete"),
						z.number().describe("The line number to delete."),
					]),
					z.tuple([
						z.literal("delete-section"),
						z.number().describe("The first line number to delete (inclusive)."),
						z.number().describe("The last line number to delete (inclusive)."),
					]),
				]),
			)
			.describe(
				'An array of patches to apply to the file. Each patch is one of: ["replace", lineNumber, content], ["insert-after", lineNumber, content], ["delete", lineNumber], or ["delete-section", startLineNumber, endLineNumber].',
			),
	}),
	outputSchema: z
		.string()
		.describe("A message indicating the result of the write operation."),
	execute: async ({ path, patch }) => {
		await writeFileExecution(path, patch);
		return `File at path ${path} has been updated successfully.`;
	},
});
