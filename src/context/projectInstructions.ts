import fs from "node:fs";
import path from "node:path";

export function loadProjectInstructions(
	cwd = process.cwd(),
): string | undefined {
	const candidates = ["CLAUDE.md", "AGENTS.md"];
	for (const filename of candidates) {
		try {
			return fs.readFileSync(path.join(cwd, filename), "utf8");
		} catch {
			// File missing or unreadable — try the next candidate.
		}
	}
	return undefined;
}

export function formatProjectInstructions(
	content: string | undefined,
): string | undefined {
	if (!content) return undefined;
	return `Project instructions:\n\n${content}`;
}

export function projectInstructionsFileExists(cwd = process.cwd()): boolean {
	return fs.existsSync(path.join(cwd, "CLAUDE.md"));
}

export function writeProjectInstructions(
	content: string,
	cwd = process.cwd(),
): void {
	fs.writeFileSync(path.join(cwd, "CLAUDE.md"), content, "utf8");
}
