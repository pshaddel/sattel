import Fuse from "fuse.js";
import type { CommandDef } from "./command-palette";

export interface MentionToken {
	start: number;
	end: number;
	query: string;
}

export const MAX_VISIBLE_FILES = 5;

function isWhitespace(char: string | undefined): boolean {
	return char === undefined || /\s/.test(char);
}

/**
 * Finds the `@`-mention token the caret is currently inside of, if any.
 * The `@` must sit at the start of the input or after whitespace (a word
 * boundary), so it doesn't fire mid-word (e.g. inside `user@example.com`),
 * and there must be no whitespace between it and the cursor.
 */
export function findActiveMentionToken(
	value: string,
	cursor: number,
): MentionToken | null {
	for (let i = cursor - 1; i >= 0; i--) {
		const char = value[i];
		if (isWhitespace(char)) {
			return null;
		}
		if (char === "@" && isWhitespace(value[i - 1])) {
			return { start: i, end: cursor, query: value.slice(i + 1, cursor) };
		}
	}
	return null;
}

const FUZZY_OPTIONS = {
	threshold: 0.4,
};

/**
 * Filters project files by a case-insensitive fuzzy match anywhere in the
 * path (via Fuse.js), mapped to the same shape `renderCommandPalette`
 * already draws. Fuzzy matching tolerates typos (transposed/missing/wrong
 * characters), not just skipped ones. A leading `./` (the project root, in
 * relative-path terms) is stripped before matching, since listed paths
 * never carry that prefix themselves. A leading `../` is left as-is and
 * simply won't match anything, since listed files never go outside the
 * project root.
 */
export function matchingFiles(query: string, files: string[]): CommandDef[] {
	const needle = query.replace(/^(\.\/)+/, "");
	if (needle === "") {
		return files
			.slice(0, MAX_VISIBLE_FILES)
			.map((file) => ({ name: file, description: "" }));
	}
	const fuse = new Fuse(files, FUZZY_OPTIONS);
	return fuse
		.search(needle)
		.slice(0, MAX_VISIBLE_FILES)
		.map((result) => ({ name: result.item, description: "" }));
}
