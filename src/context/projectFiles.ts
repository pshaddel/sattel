import fs from "node:fs";
import path from "node:path";

const ALWAYS_IGNORED = new Set([".git", "node_modules", "dist", ".sattel"]);

async function readGitignoreNames(root: string): Promise<Set<string>> {
	try {
		const content = await fs.promises.readFile(
			path.join(root, ".gitignore"),
			"utf8",
		);
		const names = content
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith("#"))
			.map((line) => line.replace(/^\/+/, "").replace(/\/+$/, ""));
		return new Set(names);
	} catch {
		return new Set();
	}
}

async function walk(
	dir: string,
	root: string,
	ignored: Set<string>,
	output: string[],
): Promise<void> {
	const entries = await fs.promises.readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		if (ALWAYS_IGNORED.has(entry.name) || ignored.has(entry.name)) {
			continue;
		}
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			await walk(fullPath, root, ignored, output);
		} else if (entry.isFile()) {
			output.push(path.relative(root, fullPath).split(path.sep).join("/"));
		}
	}
}

/**
 * Recursively lists project files as root-relative, POSIX-style paths.
 * Ignores `.git`/`node_modules`/`dist`/`.sattel` plus bare names listed in
 * a top-level `.gitignore` — a literal path-segment match, not full
 * gitignore glob semantics.
 */
export async function listProjectFiles(
	root: string = process.cwd(),
): Promise<string[]> {
	const ignored = await readGitignoreNames(root);
	const output: string[] = [];
	await walk(root, root, ignored, output);
	output.sort();
	return output;
}
