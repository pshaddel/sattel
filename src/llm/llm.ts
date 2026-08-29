import { OpenRouter, type StateAccessor, type Tool } from "@openrouter/agent";
import { modelsGet } from "@openrouter/sdk/funcs/modelsGet";
import {
	formatProjectInstructions,
	loadProjectInstructions,
} from "../context/projectInstructions";

export const openrouter = new OpenRouter({
	apiKey: process.env.OPENROUTER_API_KEY,
});

let projectInstructionsCache: { value: string | undefined } | undefined;

function getProjectInstructions(): string | undefined {
	if (!projectInstructionsCache) {
		projectInstructionsCache = { value: loadProjectInstructions() };
	}
	return projectInstructionsCache.value;
}

/**
 * Drops the cached CLAUDE.md/AGENTS.md content so the next call picks up
 * a freshly-written file instead of the stale in-memory copy — needed after
 * `runInit` writes a new CLAUDE.md mid-process.
 */
export function invalidateProjectInstructionsCache(): void {
	projectInstructionsCache = undefined;
}

const INIT_PROMPT = `Generate a CLAUDE.md file for this project — project-level instructions that get fed back to you (and future sessions) as system instructions, so an agent understands this codebase without re-exploring it every time.

Explore the project using only the readFile and shell tools (e.g. \`ls\`, \`cat\`, \`grep\`, \`git\`). Do not modify any files. Look at:
- package.json (or the equivalent for this language) for the project's name, dependencies, and scripts
- the directory structure, to find the entry point(s) and how the code is organized
- a few key source files, to understand what each top-level module actually does
- a README or similar docs, if present, for stated purpose and commands

When you're done exploring, respond with ONLY the CLAUDE.md content itself — no preamble, no code fence wrapping the whole thing, no commentary before or after. Use this structure:

# CLAUDE.md

This file provides guidance to an AI coding agent working in this repository.

## Project

One or two sentences: what this project is and what it's for.

## Commands

The commands to install dependencies, run, build, test, and lint — only ones you actually confirmed exist (e.g. in package.json scripts), not guesses.

## Architecture

A short, high-level map of the codebase: the key modules/directories and what each one is responsible for, and how they fit together. Prioritize what a new contributor would need to know to navigate the code, not an exhaustive file listing.

Keep the whole file concise — a competent engineer should be able to read it in under a minute and know how to find their way around.`;

/**
 * Explores the project with read-only tools and streams back generated
 * CLAUDE.md content as the final assistant message — the caller is
 * responsible for writing that text to disk (see `writeProjectInstructions`
 * in `../context/projectInstructions`) and for supplying a read-only `tools`
 * array (e.g. `[readFileTool, shellTool]`, no `writeFileTool`).
 */
export function runInit(tools: Tool[], state?: StateAccessor) {
	return openrouter.callModel({
		model: "openai/gpt-5-nano",
		tools,
		input: INIT_PROMPT,
		state,
	});
}

export async function getModelContextLength(
	model: string,
): Promise<number | null> {
	const [author, slug] = model.split(/\/(.*)/s);
	if (!author || !slug) {
		return null;
	}

	const result = await modelsGet(openrouter, { author, slug });
	if (!result.ok) {
		return null;
	}

	return result.value.data.contextLength;
}

export async function testLLMAccess(): Promise<void> {
	if (!process.env.OPENROUTER_API_KEY) {
		console.error(
			"Error: OPENROUTER_API_KEY is not set in the environment variables.",
		);
		return;
	}

	const result = openrouter.callModel({
		model: "openai/gpt-5-nano",
		input: "this is a test, just answer with 'ok'",
	});

	const res = await result.getText();
	if (!res) {
		console.error("Error: No response from the model.");
		process.exit(1);
	}
}

export function testStreamingLLM(
	userPrompt?: string,
	tools: Tool[] = [],
	state?: StateAccessor,
) {
	return openrouter.callModel({
		model: "openai/gpt-5-nano",
		// model: "google/gemini-3.7-flash",
		tools: tools,
		input:
			userPrompt ||
			"write a short sample javascript code snippet, which is a Express App Server",
		state,
		instructions: formatProjectInstructions(getProjectInstructions()),
	});
}

/**
 * Resumes a conversation paused with status `awaiting_approval`. `input` is
 * required by the SDK's types but unread on this path — resuming re-executes
 * approved tool calls internally rather than sending a new user message.
 */
export function resumeAfterApproval(
	tools: Tool[],
	state: StateAccessor,
	decisions: { approveToolCalls?: string[]; rejectToolCalls?: string[] },
) {
	return openrouter.callModel({
		model: "openai/gpt-5-nano",
		tools,
		input: "",
		state,
		instructions: formatProjectInstructions(getProjectInstructions()),
		...decisions,
	});
}
