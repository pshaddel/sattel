import path from "node:path";
import { tool } from "@openrouter/agent";
import { z } from "zod";
import { isShellCommandAllowed } from "../settings/settings";
import { resolveWithinRoot } from "./path-guard";

export const ALWAYS_ALLOWED_SHELL_COMMANDS = new Set([
	"ls",
	"cat",
	"grep",
	"git",
]);

export function computeShellCommandKey(
	command: string,
	args: string[],
): string {
	return args.length > 0 ? `${command} ${args[0]}` : command;
}

function looksLikePathArg(value: string): boolean {
	return (
		value.startsWith("/") ||
		value.startsWith("./") ||
		value.startsWith("../") ||
		value.startsWith("~") ||
		value.includes("/")
	);
}

/**
 * A bare arg (e.g. "../secret") and the value half of a "--flag=value" arg
 * (e.g. "--git-dir=/tmp/x/.git") are both checked — the latter catches the
 * common "pass a path via an = -joined flag" pattern. This is a heuristic,
 * not a per-command argument parser: a value that merely *contains* a slash
 * (a grep pattern, a URL) can be flagged too, but since non-escaping
 * candidates always pass, the only cost is an occasional false rejection.
 */
function pathCandidatesInArg(arg: string): string[] {
	const candidates = [arg];
	const eq = arg.indexOf("=");
	if (eq !== -1) {
		candidates.push(arg.slice(eq + 1));
	}
	return candidates.filter(looksLikePathArg);
}

function assertWithinRoot(
	candidatePath: string,
	root: string,
	label: string,
): string {
	const resolved = resolveWithinRoot(candidatePath, root);
	if (resolved === null) {
		throw new Error(
			`Refusing to run: ${label} "${candidatePath}" resolves outside the project directory (${root}).`,
		);
	}
	return resolved;
}

const inputSchema = z.object({
	command: z
		.string()
		.describe(
			"The executable to run, e.g. 'npm', 'bun', 'git'. Do not include arguments here.",
		),
	args: z
		.array(z.string())
		.default([])
		.describe(
			"Arguments as separate array elements, not one shell string — there is no shell involved, so pipes/redirects/&& are not available.",
		),
	cwd: z
		.string()
		.optional()
		.describe(
			"Working directory, relative to the project root. Defaults to the current directory.",
		),
});

export const shellTool = tool({
	name: "shell",
	description: [
		"Runs a shell command directly (no shell interpolation — no pipes/redirects/&&; pass each argument as its own array element).",
		"Every path (in 'cwd' or in 'args', absolute or relative) must stay inside the project directory — nested subdirectories are fine, but '..' or an absolute path pointing elsewhere is refused.",
		"'ls', 'cat', 'grep', and 'git' run immediately with any arguments.",
		"Any other command requires one-time human approval; once approved, the same command plus its first argument (e.g. 'npm run') runs without prompting again.",
		"Examples:",
		'  { command: "ls", args: ["-la", "src"] }',
		'  { command: "cat", args: ["src/index.ts"] }',
		'  { command: "grep", args: ["-n", "TODO", "-r", "src"] }',
		'  { command: "git", args: ["status"] }',
		'  { command: "git", args: ["diff", "--stat"] }',
		'  { command: "npm", args: ["run", "build"] }   // prompts for approval once, then remembered',
		'  { command: "bun", args: ["run", "test"] }    // prompts for approval once, then remembered',
	].join("\n"),
	inputSchema,
	outputSchema: z.object({
		stdout: z.string(),
		stderr: z.string(),
		exitCode: z.number(),
	}),
	requireApproval: ({ command, args }) => {
		if (ALWAYS_ALLOWED_SHELL_COMMANDS.has(command)) {
			return false;
		}
		return !isShellCommandAllowed(computeShellCommandKey(command, args));
	},
	execute: async ({ command, args, cwd }) => {
		const root = process.cwd();
		const effectiveCwd = cwd ? assertWithinRoot(cwd, root, "cwd") : root;
		for (const arg of args) {
			for (const candidate of pathCandidatesInArg(arg)) {
				assertWithinRoot(
					path.resolve(effectiveCwd, candidate),
					root,
					"argument",
				);
			}
		}

		try {
			const proc = Bun.spawn([command, ...args], {
				cwd: effectiveCwd,
				stdout: "pipe",
				stderr: "pipe",
			});
			const [stdout, stderr, exitCode] = await Promise.all([
				new Response(proc.stdout).text(),
				new Response(proc.stderr).text(),
				proc.exited,
			]);
			return { stdout, stderr, exitCode };
		} catch (error) {
			if (
				error instanceof Error &&
				(error as NodeJS.ErrnoException).code === "ENOENT"
			) {
				throw new Error(`Command not found: ${command}`);
			}
			throw error;
		}
	},
});
