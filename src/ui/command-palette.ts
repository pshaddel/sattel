import {
	EXIT_COMMANDS,
	INIT_COMMANDS,
	RESET_COMMANDS,
} from "./command-highlighter";

export type MatchRange = readonly [number, number];

export interface CommandDef {
	name: string;
	description: string;
	/** Inclusive [start, end] character ranges of `name` matched by a fuzzy search, for highlighting. */
	matches?: readonly MatchRange[];
}

const DESCRIPTIONS: Record<string, string> = {
	"/exit": "Exit the session",
	"/quit": "Exit the session",
	"/new": "Start a new session",
	"/reset": "Start a new session",
	"/init": "Explore the project and generate CLAUDE.md",
};

const COMMANDS: CommandDef[] = [
	...EXIT_COMMANDS,
	...RESET_COMMANDS,
	...INIT_COMMANDS,
].map((name) => ({ name, description: DESCRIPTIONS[name] ?? "" }));

export const MAX_VISIBLE_COMMANDS = 5;

export function matchingCommands(value: string): CommandDef[] {
	if (!value.startsWith("/") || /\s/.test(value)) {
		return [];
	}
	return COMMANDS.filter((command) => command.name.startsWith(value)).slice(
		0,
		MAX_VISIBLE_COMMANDS,
	);
}

/**
 * Renders `text` into `parent`, wrapping the character ranges in `matches`
 * (Fuse.js's inclusive [start, end] indices) in `.palette-match` spans.
 */
function renderHighlightedName(
	doc: Document,
	parent: HTMLElement,
	text: string,
	matches: readonly MatchRange[] | undefined,
) {
	if (!matches || matches.length === 0) {
		parent.textContent = text;
		return;
	}

	const ranges = [...matches].sort((a, b) => a[0] - b[0]);
	let cursor = 0;
	for (const [start, end] of ranges) {
		const matchStart = Math.max(start, cursor);
		if (matchStart > cursor) {
			parent.appendChild(doc.createTextNode(text.slice(cursor, matchStart)));
		}
		if (end + 1 > matchStart) {
			const span = doc.createElement("span");
			span.className = "palette-match";
			span.textContent = text.slice(matchStart, end + 1);
			parent.appendChild(span);
			cursor = end + 1;
		}
	}
	if (cursor < text.length) {
		parent.appendChild(doc.createTextNode(text.slice(cursor)));
	}
}

export function renderCommandPalette(
	container: HTMLElement,
	commands: CommandDef[],
	selectedIndex: number,
) {
	while (container.firstChild) {
		container.removeChild(container.firstChild);
	}

	const doc = container.ownerDocument;
	if (!doc || commands.length === 0) {
		return;
	}

	commands.forEach((command, index) => {
		const row = doc.createElement("div");
		row.className =
			index === selectedIndex ? "palette-item selected" : "palette-item";

		const name = doc.createElement("span");
		name.className = "palette-name";
		renderHighlightedName(doc, name, command.name, command.matches);

		const description = doc.createElement("span");
		description.className = "palette-description";
		description.textContent = command.description;

		row.appendChild(name);
		row.appendChild(description);
		container.appendChild(row);
	});
}
