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
import {
	type ConversationState,
	OpenRouter,
	type SessionUsageTotals,
	type StateAccessor,
} from "@openrouter/agent";
import { shellTool } from "../../src/tools/shell";
import { models } from "../models";

// These tests make real, billed calls to OpenRouter. They only run when both
// RUN_INTEGRATION_TESTS and OPENROUTER_API_KEY are set (see `bun run test:integration`),
// so a plain `bun test` stays fast, offline, and free.
const canRun = Boolean(
	process.env.RUN_INTEGRATION_TESTS && process.env.OPENROUTER_API_KEY,
);

setDefaultTimeout(30_000);

const TEMP_DIR = path.join(import.meta.dir, "temp-shell-integration");

function tempPath(name: string) {
	return path.join(TEMP_DIR, name);
}

function slugify(model: string) {
	return model.replace(/[/.]/g, "-");
}

describe.skipIf(!canRun)("live OpenRouter shell tool-calling", () => {
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
		console.log(
			"\n=== OpenRouter shell-tool integration test cost summary ===",
		);
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

	async function runPrompt(model: string, scenario: string, input: string) {
		const result = client.callModel({
			model,
			input,
			tools: [shellTool] as const,
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
			const callSummary = toolCalls.length
				? toolCalls.map((c) => `${c.name}(${c.arguments})`).join(", ")
				: "(none)";
			console.log(
				`  [${model} / ${scenario}] tools called: ${callSummary} | final text: ${JSON.stringify(text.slice(0, 200))}`,
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
			test("reads a file via cat when asked", async () => {
				const filePath = tempPath(`${slugify(model)}-config.txt`);
				await fs.promises.writeFile(filePath, "MAX_RETRIES=7\n", "utf8");

				const { toolCalls, text } = await runPrompt(
					model,
					"cat",
					`Use your available tools to cat the file at "${filePath}" and tell me what MAX_RETRIES is set to. Respond with only the number.`,
				);

				const catCalls = toolCalls.filter(
					(call) =>
						call.name === "shell" && parsedArguments(call).command === "cat",
				);
				expect(catCalls.length).toBeGreaterThan(0);
				expect(text).toContain("7");
			});

			test("searches with grep when asked", async () => {
				const filePath = tempPath(`${slugify(model)}-haystack.txt`);
				await fs.promises.writeFile(
					filePath,
					"one\nNEEDLE_MARKER_XYZ\nthree\n",
					"utf8",
				);

				const { toolCalls, text } = await runPrompt(
					model,
					"grep",
					`Use your available tools to grep for "NEEDLE_MARKER_XYZ" inside the directory "${TEMP_DIR}" and tell me the name of the file it was found in.`,
				);

				const grepCalls = toolCalls.filter(
					(call) =>
						call.name === "shell" && parsedArguments(call).command === "grep",
				);
				expect(grepCalls.length).toBeGreaterThan(0);
				expect(text).toContain(path.basename(filePath));
			});

			test("lists a directory via ls when asked", async () => {
				await fs.promises.writeFile(
					tempPath(`${slugify(model)}-alpha.txt`),
					"",
					"utf8",
				);
				await fs.promises.writeFile(
					tempPath(`${slugify(model)}-beta.txt`),
					"",
					"utf8",
				);

				const { toolCalls, text } = await runPrompt(
					model,
					"ls",
					`Use your available tools to list the files in the directory "${TEMP_DIR}" and tell me their names.`,
				);

				const lsCalls = toolCalls.filter(
					(call) =>
						call.name === "shell" && parsedArguments(call).command === "ls",
				);
				expect(lsCalls.length).toBeGreaterThan(0);
				expect(text).toContain(`${slugify(model)}-alpha.txt`);
				expect(text).toContain(`${slugify(model)}-beta.txt`);
			});

			test("requests approval before running an unlisted command, then proceeds once approved", async () => {
				let state: ConversationState | null = null;
				const stateAccessor: StateAccessor = {
					load: async () => state,
					save: async (s) => {
						state = s;
					},
				};

				const result = client.callModel({
					model,
					input: `Use your available tools to run "npm run build" with cwd "${TEMP_DIR}" and tell me what happened.`,
					tools: [shellTool] as const,
					state: stateAccessor,
				});

				for await (const _item of result.getItemsStream()) {
					// The run pauses before the shell command executes, since "npm run"
					// isn't allowlisted — draining just lets it reach that pause.
				}

				expect(await result.requiresApproval()).toBe(true);
				const pending = await result.getPendingToolCalls();
				expect(pending.length).toBeGreaterThan(0);
				const shellCall = pending.find((call) => call.name === "shell");
				expect(shellCall).toBeDefined();
				expect((shellCall?.arguments as { command?: string })?.command).toBe(
					"npm",
				);

				const resumed = client.callModel({
					model,
					tools: [shellTool] as const,
					input: "",
					state: stateAccessor,
					approveToolCalls: shellCall ? [shellCall.id] : [],
				});

				for await (const _item of resumed.getItemsStream()) {
					// drain to completion — the approved call now actually runs.
				}

				const usage = await resumed.getUsage();
				usageLog.push({ model, scenario: "shell-approval-resume", usage });

				const finalState = await stateAccessor.load();
				expect(finalState?.status).toBe("complete");
			});
		});
	}
});
