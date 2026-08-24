export const EXIT_COMMANDS = ["/exit", "/quit"];
export const RESET_COMMANDS = ["/new", "/init", "/reset"];

const ALL_COMMANDS = [...EXIT_COMMANDS, ...RESET_COMMANDS];

export function matchesAny(value: string, commands: string[]): boolean {
	return commands.some((command) => value.includes(command));
}

export function findCommandMatch(
	value: string,
): { start: number; end: number } | null {
	let match: { start: number; end: number } | null = null;
	for (const command of ALL_COMMANDS) {
		const start = value.indexOf(command);
		if (start !== -1 && (match === null || start < match.start)) {
			match = { start, end: start + command.length };
		}
	}
	return match;
}
