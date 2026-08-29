import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { recordAllowedShellCommand } from "../../src/settings/settings";
import { computeShellCommandKey, shellTool } from "../../src/tools/shell";

const TEMP_DIR = path.join(import.meta.dir, "temp");

function tempPath(name: string) {
	return path.join(TEMP_DIR, name);
}

beforeEach(async () => {
	await fs.promises.mkdir(TEMP_DIR, { recursive: true });
});

afterEach(async () => {
	await fs.promises.rm(TEMP_DIR, { recursive: true, force: true });
});

describe("computeShellCommandKey", () => {
	test("keys on the command plus its first argument", () => {
		expect(computeShellCommandKey("npm", ["run", "build"])).toBe("npm run");
	});

	test("keys on the bare command when there are no args", () => {
		expect(computeShellCommandKey("npx", [])).toBe("npx");
	});

	test("keeps a flag as part of the key verbatim", () => {
		expect(computeShellCommandKey("npm", ["-v"])).toBe("npm -v");
	});
});

describe("shellTool execution", () => {
	test("cat returns the real file contents", async () => {
		const filePath = tempPath("hello.txt");
		await fs.promises.writeFile(filePath, "hello world", "utf8");

		const result = await shellTool.function.execute({
			command: "cat",
			args: [filePath],
			cwd: undefined,
		});

		expect(result.stdout).toBe("hello world");
		expect(result.exitCode).toBe(0);
	});

	test("grep returns matching lines", async () => {
		const filePath = tempPath("haystack.txt");
		await fs.promises.writeFile(filePath, "one\nneedle\nthree", "utf8");

		const result = await shellTool.function.execute({
			command: "grep",
			args: ["-n", "needle", filePath],
			cwd: undefined,
		});

		expect(result.stdout).toContain("needle");
		expect(result.exitCode).toBe(0);
	});

	test("ls lists files in the target directory", async () => {
		await fs.promises.writeFile(tempPath("a.txt"), "", "utf8");
		await fs.promises.writeFile(tempPath("b.txt"), "", "utf8");

		const result = await shellTool.function.execute({
			command: "ls",
			args: ["-1", TEMP_DIR],
			cwd: undefined,
		});

		expect(result.stdout).toContain("a.txt");
		expect(result.stdout).toContain("b.txt");
		expect(result.exitCode).toBe(0);
	});

	test("git runs without throwing", async () => {
		const result = await shellTool.function.execute({
			command: "git",
			args: ["status"],
			cwd: undefined,
		});

		expect(typeof result.exitCode).toBe("number");
	});

	test("rejects with a clear error for a nonexistent command", async () => {
		await expect(
			shellTool.function.execute({
				command: "definitely-not-a-real-binary",
				args: [],
				cwd: undefined,
			}),
		).rejects.toThrow("Command not found: definitely-not-a-real-binary");
	});
});

describe("shellTool path boundary", () => {
	test("allows a cwd nested inside the project directory", async () => {
		await fs.promises.mkdir(tempPath("nested"), { recursive: true });
		await fs.promises.writeFile(tempPath("nested/inside.txt"), "hi", "utf8");

		const originalCwd = process.cwd();
		process.chdir(TEMP_DIR);
		try {
			const result = await shellTool.function.execute({
				command: "cat",
				args: ["inside.txt"],
				cwd: "nested",
			});
			expect(result.stdout).toBe("hi");
		} finally {
			process.chdir(originalCwd);
		}
	});

	test("rejects a cwd that escapes the project directory via '..'", async () => {
		const originalCwd = process.cwd();
		process.chdir(TEMP_DIR);
		try {
			await expect(
				shellTool.function.execute({ command: "ls", args: [], cwd: ".." }),
			).rejects.toThrow(/resolves outside the project directory/);
		} finally {
			process.chdir(originalCwd);
		}
	});

	test("rejects a relative argument that escapes the project directory", async () => {
		const originalCwd = process.cwd();
		process.chdir(TEMP_DIR);
		try {
			await expect(
				shellTool.function.execute({
					command: "cat",
					args: ["../outside.txt"],
					cwd: undefined,
				}),
			).rejects.toThrow(/resolves outside the project directory/);
		} finally {
			process.chdir(originalCwd);
		}
	});

	test("rejects an absolute argument outside the project directory", async () => {
		const originalCwd = process.cwd();
		process.chdir(TEMP_DIR);
		try {
			await expect(
				shellTool.function.execute({
					command: "cat",
					args: ["/etc/passwd"],
					cwd: undefined,
				}),
			).rejects.toThrow(/resolves outside the project directory/);
		} finally {
			process.chdir(originalCwd);
		}
	});

	test("rejects a path smuggled through a --flag=value argument", async () => {
		const originalCwd = process.cwd();
		process.chdir(TEMP_DIR);
		try {
			await expect(
				shellTool.function.execute({
					command: "git",
					args: ["--git-dir=/tmp/definitely-outside/.git", "status"],
					cwd: undefined,
				}),
			).rejects.toThrow(/resolves outside the project directory/);
		} finally {
			process.chdir(originalCwd);
		}
	});

	test("allows an absolute argument that resolves inside the project directory", async () => {
		const filePath = tempPath("absolute-inside.txt");
		await fs.promises.writeFile(filePath, "hello", "utf8");

		const result = await shellTool.function.execute({
			command: "cat",
			args: [filePath],
			cwd: undefined,
		});

		expect(result.stdout).toBe("hello");
	});
});

describe("shellTool requireApproval gating", () => {
	const requireApproval = shellTool.function.requireApproval as (
		params: { command: string; args: string[]; cwd?: string },
		context?: unknown,
	) => boolean | Promise<boolean>;

	test("always-allowed base commands never require approval", async () => {
		for (const command of ["ls", "cat", "grep", "git"]) {
			const required = await requireApproval(
				{ command, args: ["--anything"] },
				undefined,
			);
			expect(required).toBe(false);
		}
	});

	// requireApproval checks settings relative to the CLI's own process.cwd()
	// (where `.sattel/settings.json` lives), not the tool call's `cwd` field
	// (which only controls where the command itself executes) — so these
	// tests temporarily chdir into TEMP_DIR rather than passing `cwd` on the input.
	test("an unapproved non-base command requires approval", async () => {
		const originalCwd = process.cwd();
		process.chdir(TEMP_DIR);
		try {
			const required = await requireApproval(
				{ command: "npm", args: ["run", "build"] },
				undefined,
			);
			expect(required).toBe(true);
		} finally {
			process.chdir(originalCwd);
		}
	});

	test("a recorded command no longer requires approval", async () => {
		recordAllowedShellCommand("npm run", TEMP_DIR);

		const originalCwd = process.cwd();
		process.chdir(TEMP_DIR);
		try {
			const required = await requireApproval(
				{ command: "npm", args: ["run", "build"] },
				undefined,
			);
			expect(required).toBe(false);
		} finally {
			process.chdir(originalCwd);
		}
	});
});

describe("shellTool input validation", () => {
	test("rejects a missing command", () => {
		const result = shellTool.function.inputSchema.safeParse({ args: [] });
		expect(result.success).toBe(false);
	});

	test("defaults args to an empty array when omitted", () => {
		const result = shellTool.function.inputSchema.safeParse({ command: "ls" });
		expect(result.success).toBe(true);
		expect(result.success ? result.data.args : null).toEqual([]);
	});

	test("accepts an optional cwd", () => {
		const result = shellTool.function.inputSchema.safeParse({
			command: "ls",
			args: [],
			cwd: "/tmp",
		});
		expect(result.success).toBe(true);
	});
});
