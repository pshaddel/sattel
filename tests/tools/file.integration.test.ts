import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { OpenRouter, type SessionUsageTotals } from "@openrouter/agent";
import { readFileTool, writeFileTool } from "../../src/tools/file";
import { models } from "../models";

// These tests make real, billed calls to OpenRouter. They only run when both
// RUN_INTEGRATION_TESTS and OPENROUTER_API_KEY are set (see `bun run test:integration`),
// so a plain `bun test` stays fast, offline, and free.
const canRun = Boolean(
	process.env.RUN_INTEGRATION_TESTS && process.env.OPENROUTER_API_KEY,
);

setDefaultTimeout(30_000);

const TEMP_DIR = path.join(import.meta.dir, "temp-integration");

function tempPath(name: string) {
	return path.join(TEMP_DIR, name);
}

function slugify(model: string) {
	return model.replace(/[/.]/g, "-");
}

describe.skipIf(!canRun)("live OpenRouter tool-calling", () => {
	const client = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
	const usageLog: {
		model: string;
		scenario: string;
		usage: SessionUsageTotals;
	}[] = [];

	beforeEach(async () => {
		await fs.promises.mkdir(TEMP_DIR, { recursive: true });
	});

	afterEach(async () => {
		await fs.promises.rm(TEMP_DIR, { recursive: true, force: true });
	});

	afterAll(() => {
		if (usageLog.length === 0) {
			return;
		}
		console.log("\n=== OpenRouter integration test cost summary ===");
		let totalCost = 0;
		let totalTokens = 0;
		for (const entry of usageLog) {
			const cost = entry.usage.cost ?? 0;
			totalCost += cost;
			totalTokens += entry.usage.totalTokens;
			console.log(
				`  ${entry.model} [${entry.scenario}]: $${cost.toFixed(6)} (${entry.usage.totalTokens} tokens, ${entry.usage.modelCalls} model call(s))`,
			);
		}
		console.log(
			`  TOTAL: $${totalCost.toFixed(6)} across ${usageLog.length} run(s), ${totalTokens} tokens\n`,
		);
	});

	/**
	 * `ModelResult.getToolCalls()` only reflects the *initial* round when tools
	 * have `execute` functions (they get auto-executed) — it misses a `writeFile`
	 * call that happens in a later round after e.g. a `readFile` call. Draining
	 * `getItemsStream()` instead surfaces `function_call` items across every
	 * round, which is what we actually want to assert on here.
	 */
	async function runPrompt(model: string, scenario: string, input: string) {
		const result = client.callModel({
			model,
			input,
			tools: [readFileTool, writeFileTool] as const,
		});
		const callsById = new Map<string, { name: string; arguments: string }>();
		try {
			for await (const item of result.getItemsStream()) {
				if (item.type === "function_call" && item.status === "completed") {
					callsById.set(item.callId, {
						name: item.name,
						arguments: item.arguments,
					});
				}
			}
			const text = await result.getText();
			const toolCalls = [...callsById.values()];
			console.log(
				`  [${model} / ${scenario}] tools called: ${
					toolCalls.length ? toolCalls.map((c) => c.name).join(", ") : "(none)"
				} | final text: ${JSON.stringify(text.slice(0, 200))}`,
			);
			return { toolCalls, text };
		} finally {
			const usage = await result.getUsage();
			usageLog.push({ model, scenario, usage });
		}
	}

	function parsedArguments(call: {
		arguments: string;
	}): Record<string, unknown> {
		try {
			return JSON.parse(call.arguments);
		} catch {
			return {};
		}
	}

	for (const model of models) {
		describe(model, () => {
			test("answers a question about a value defined in a source file", async () => {
				const filePath = tempPath(`${slugify(model)}-config.ts`);
				await fs.promises.writeFile(
					filePath,
					[
						"export const MAX_RETRIES = 7;",
						'export const SERVICE_NAME = "billing-service";',
						"export const TIMEOUT_MS = 3000;",
						"",
					].join("\n"),
					"utf8",
				);

				const { toolCalls, text } = await runPrompt(
					model,
					"read",
					`Use your available tools to check the file at "${filePath}" and tell me what MAX_RETRIES is set to. Respond with only the number.`,
				);

				const readCalls = toolCalls.filter((call) => call.name === "readFile");
				expect(readCalls.length).toBeGreaterThan(0);
				expect(
					readCalls.some((call) => parsedArguments(call).path === filePath),
				).toBe(true);
				expect(text).toContain("7");
			});

			test("updates a constant's value when asked in plain terms", async () => {
				const filePath = tempPath(`${slugify(model)}-pricing.ts`);
				await fs.promises.writeFile(
					filePath,
					[
						"export const TAX_RATE = 0.05;",
						"",
						"export function calculateTotal(price: number): number {",
						"\treturn price + price * TAX_RATE;",
						"}",
						"",
					].join("\n"),
					"utf8",
				);

				const { toolCalls } = await runPrompt(
					model,
					"replace",
					`Use your available tools to open the file at "${filePath}" and update the tax rate to 0.08. Leave everything else in the file unchanged. Reply with "done" when finished.`,
				);

				expect(toolCalls.some((call) => call.name === "writeFile")).toBe(true);
				const content = await fs.promises.readFile(filePath, "utf8");
				expect(content).toContain("0.08");
				expect(content).not.toContain("0.05");
				expect(content).toContain("calculateTotal");
				expect(content).toContain("return price + price * TAX_RATE;");
			});

			test("adds a log statement in the right place when asked", async () => {
				const filePath = tempPath(`${slugify(model)}-greet.ts`);
				await fs.promises.writeFile(
					filePath,
					[
						"export function greet(name: string): string {",
						"\tconst message = `Hello, ${name}!`;",
						"\treturn message;",
						"}",
						"",
					].join("\n"),
					"utf8",
				);

				const { toolCalls } = await runPrompt(
					model,
					"insert-after",
					`Use your available tools to open the file at "${filePath}" and add a console.log that logs the message, placed right after the message is built and before it's returned. Reply with "done" when finished.`,
				);

				expect(toolCalls.some((call) => call.name === "writeFile")).toBe(true);
				const content = await fs.promises.readFile(filePath, "utf8");
				expect(content).toContain("console.log");
				const messageIndex = content.indexOf("const message");
				const logIndex = content.indexOf("console.log");
				const returnIndex = content.indexOf("return message");
				expect(messageIndex).toBeGreaterThanOrEqual(0);
				expect(returnIndex).toBeGreaterThan(logIndex);
				expect(logIndex).toBeGreaterThan(messageIndex);
			});

			test("removes a leftover debug statement when asked", async () => {
				const filePath = tempPath(`${slugify(model)}-config-reader.ts`);
				await fs.promises.writeFile(
					filePath,
					[
						'import fs from "node:fs";',
						"",
						"export function readConfig(path: string) {",
						'\tconsole.log("DEBUG: reading config");',
						'\tconst data = fs.readFileSync(path, "utf8");',
						"\treturn JSON.parse(data);",
						"}",
						"",
					].join("\n"),
					"utf8",
				);

				const { toolCalls } = await runPrompt(
					model,
					"delete",
					`Use your available tools to open the file at "${filePath}" and remove the leftover debug console.log statement. Leave everything else unchanged. Reply with "done" when finished.`,
				);

				expect(toolCalls.some((call) => call.name === "writeFile")).toBe(true);
				const content = await fs.promises.readFile(filePath, "utf8");
				expect(content).not.toContain("DEBUG: reading config");
				expect(content).toContain("fs.readFileSync");
				expect(content).toContain("JSON.parse(data)");
			});

			test("deletes a whole deprecated function when asked", async () => {
				const filePath = tempPath(`${slugify(model)}-math.ts`);
				await fs.promises.writeFile(
					filePath,
					[
						"export function add(a: number, b: number): number {",
						"\treturn a + b;",
						"}",
						"",
						"// deprecated, no longer used anywhere",
						"export function oldMultiply(a: number, b: number): number {",
						"\tlet result = 0;",
						"\tfor (let i = 0; i < b; i++) {",
						"\t\tresult += a;",
						"\t}",
						"\treturn result;",
						"}",
						"",
						"export function subtract(a: number, b: number): number {",
						"\treturn a - b;",
						"}",
						"",
					].join("\n"),
					"utf8",
				);

				const { toolCalls } = await runPrompt(
					model,
					"delete-section",
					`Use your available tools to open the file at "${filePath}" and delete the deprecated "oldMultiply" function entirely, including its comment. Leave the other functions unchanged. Reply with "done" when finished.`,
				);

				expect(toolCalls.some((call) => call.name === "writeFile")).toBe(true);
				const content = await fs.promises.readFile(filePath, "utf8");
				expect(content).not.toContain("oldMultiply");
				expect(content).toContain("export function add");
				expect(content).toContain("return a + b;");
				expect(content).toContain("export function subtract");
				expect(content).toContain("return a - b;");
			});
		});
	}
});
