import { EXIT_COMMANDS, RESET_COMMANDS } from "./command-highlighter";

export interface CommandDef {
	name: string;
	description: string;
}

const DESCRIPTIONS: Record<string, string> = {
	"/exit": "Exit the session",
	"/quit": "Exit the session",
	"/new": "Start a new session",
	"/init": "Start a new session",
	"/reset": "Start a new session",
};

const COMMANDS: CommandDef[] = [...EXIT_COMMANDS, ...RESET_COMMANDS].map(
	(name) => ({ name, description: DESCRIPTIONS[name] ?? "" }),
);

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
		name.textContent = command.name;

		const description = doc.createElement("span");
		description.className = "palette-description";
		description.textContent = command.description;

		row.appendChild(name);
		row.appendChild(description);
		container.appendChild(row);
	});
}
