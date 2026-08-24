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

type FileEdit = {
	old_string: string;
	new_string: string;
	replace_all?: boolean;
};

async function writeFileExecution(path: string, edits: FileEdit[]) {
	try {
		let content = await fs.promises.readFile(path, "utf8");

		for (const { old_string, new_string, replace_all } of edits) {
			if (old_string === "") {
				content += new_string;
				continue;
			}

			if (replace_all) {
				if (!content.includes(old_string)) {
					throw new Error(
						`old_string not found in ${path}: ${JSON.stringify(old_string)}`,
					);
				}
				content = content.split(old_string).join(new_string);
				continue;
			}

			const firstIndex = content.indexOf(old_string);
			if (firstIndex === -1) {
				throw new Error(
					`old_string not found in ${path}: ${JSON.stringify(old_string)}`,
				);
			}
			const secondIndex = content.indexOf(
				old_string,
				firstIndex + old_string.length,
			);
			if (secondIndex !== -1) {
				throw new Error(
					`old_string matches more than once in ${path}: ${JSON.stringify(old_string)}. Include more surrounding context to make it unique, or pass replace_all: true.`,
				);
			}
			content =
				content.slice(0, firstIndex) +
				new_string +
				content.slice(firstIndex + old_string.length);
		}

		await fs.promises.writeFile(path, content, "utf8");
	} catch (error) {
		if (
			error instanceof Error &&
			(error as NodeJS.ErrnoException).code === "ENOENT"
		) {
			// create the file from the append-style edits only (old_string === "") —
			// the other edits have no existing content to match against yet, so
			// they're ignored here.
			const content = edits
				.filter((edit) => edit.old_string === "")
				.map((edit) => edit.new_string)
				.join("");
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
		'Writes to a file by finding an exact snippet of its current content and replacing it with new content — the same convention as a standard str_replace / Edit-style code-editing tool. Each edit is {old_string, new_string}: old_string must match the file\'s current content exactly (including whitespace/indentation) and must be unique unless replace_all is set — include enough surrounding lines to make it unique otherwise. Use new_string: "" to delete old_string entirely (works for a single line or a whole multi-line block). Use old_string: "" to append new_string to the end of the file; if the file does not exist, it is created from the edits whose old_string is "" (concatenated in order). Multiple edits in one call are applied in order against the file\'s progressively-updated content.',
	inputSchema: z.object({
		path: z.string().describe("The path to the file to be written."),
		edits: z
			.array(
				z.object({
					old_string: z
						.string()
						.describe(
							'The exact text to find in the file, including whitespace/indentation. Must be unique in the file unless replace_all is set. Use "" to append new_string to the end of the file (or to create the file, if it does not exist yet).',
						),
					new_string: z
						.string()
						.describe(
							'The text to replace old_string with. Use "" to delete old_string entirely.',
						),
					replace_all: z
						.boolean()
						.optional()
						.describe(
							"Replace every occurrence of old_string instead of requiring exactly one match. Defaults to false.",
						),
				}),
			)
			.describe(
				"An ordered list of find-and-replace edits to apply to the file. Each edit is matched against the file's content as updated by any earlier edits in this same list.",
			),
	}),
	outputSchema: z
		.string()
		.describe("A message indicating the result of the write operation."),
	execute: async ({ path, edits }) => {
		await writeFileExecution(path, edits);
		return `File at path ${path} has been updated successfully.`;
	},
});
