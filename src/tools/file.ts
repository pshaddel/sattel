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

type FilePatch = [number, string] | ["insert-after", string];
async function writeFileExecution(path: string, patch: FilePatch[]) {
	try {
		const fileContent = await fs.promises.readFile(path, "utf8");
		if (!fileContent) {
			throw new Error(`File at path ${path} is empty or could not be read.`);
		}

		const lines = fileContent.split("\n");
		let anchorLineNumber: number | undefined;
		for (const [lineNumber, newContent] of patch) {
			if (lineNumber === "insert-after") {
				if (anchorLineNumber === undefined) {
					throw new Error(
						'An "insert-after" patch must come after a patch with a numeric line number to anchor it to.',
					);
				}
				lines[anchorLineNumber] = `${lines[anchorLineNumber]}\n${newContent}`;
			} else if (lineNumber >= 0 && lineNumber < lines.length) {
				lines[lineNumber] = newContent;
				anchorLineNumber = lineNumber;
			}
		}

		await fs.promises.writeFile(path, lines.join("\n"), "utf8");
	} catch (error) {
		if (
			error instanceof Error &&
			(error as NodeJS.ErrnoException).code === "ENOENT"
		) {
			// create the file and write the content to it
			await fs.promises.writeFile(
				path,
				patch.map(([_, content]) => content).join("\n"),
				"utf8",
			);
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
		'Writes to a file based on specified patches. Each patch is defined by a line number and the new content for that line. if the file is not found, we create a new file and write the content to it. To insert a brand-new line in the middle of the file without shifting any other patch\'s line numbers, use the literal "insert-after" instead of a line number: its content is inserted right after the most recent patch in the array that had a numeric line number (the "anchor"). Chain multiple "insert-after" entries after the same anchor to insert several new lines in order, one after another.',
	inputSchema: z.object({
		path: z.string().describe("The path to the file to be written."),
		patch: z
			.array(
				z.union([
					z.tuple([
						z.number().describe("The line number to replace."),
						z.string().describe("The new content for the specified line."),
					]),
					z.tuple([
						z
							.literal("insert-after")
							.describe(
								'Inserts a brand-new line right after the most recent numeric-line patch (the "anchor"), instead of replacing an existing line. Must be preceded by a numeric-line patch in the same array.',
							),
						z.string().describe("The content of the new line to insert."),
					]),
				]),
			)
			.describe(
				'An array of patches to apply to the file. Each patch is either [lineNumber, content] to replace a line, or ["insert-after", content] to insert a new line right after the nearest preceding numeric-line patch.',
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
