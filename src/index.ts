import { TermDOM } from "@b9g/termdom";
import type { ConversationState, StateAccessor, Tool } from "@openrouter/agent";
import { listProjectFiles } from "./context/projectFiles";
import {
	projectInstructionsFileExists,
	writeProjectInstructions,
} from "./context/projectInstructions";
import {
	invalidateProjectInstructionsCache,
	resumeAfterApproval,
	runInit,
	testStreamingLLM,
} from "./llm/llm";
import { recordAllowedShellCommand } from "./settings/settings";
import { readFileTool, writeFileTool } from "./tools/file";
import { toolVerb } from "./tools/file.helper";
import { computeShellCommandKey, shellTool } from "./tools/shell";
import { describeToolCall, describeToolCallJson } from "./tools/tool-display";
import {
	EXIT_COMMANDS,
	findCommandMatch,
	INIT_COMMANDS,
	matchesAny,
	RESET_COMMANDS,
} from "./ui/command-highlighter";
import {
	type CommandDef,
	matchingCommands,
	renderCommandPalette,
} from "./ui/command-palette";
import {
	findActiveMentionToken,
	type MentionToken,
	matchingFiles,
} from "./ui/file-mention";
import { startSpinner } from "./ui/spinner";
import { STYLES } from "./ui/styles";

const TOOLS: Tool[] = [readFileTool, writeFileTool, shellTool];
const INIT_TOOLS: Tool[] = [readFileTool, shellTool];

async function main() {
	const term = new TermDOM();
	await term.attach();
	const { document } = term;

	const style = document.createElement("style");
	style.textContent = STYLES;
	document.head.appendChild(style);

	const banner = document.createElement("div");
	banner.className = "banner";
	banner.textContent = "Sattel Coding Agent";
	document.body.appendChild(banner);

	const log = document.createElement("div");
	log.className = "log";
	document.body.appendChild(log);

	const commandPalette = document.createElement("div");
	commandPalette.className = "command-palette";
	document.body.appendChild(commandPalette);

	let paletteCommands: CommandDef[] = [];
	let paletteSelectedIndex = 0;
	let activeMentionToken: MentionToken | null = null;
	let projectFiles: string[] = [];
	listProjectFiles().then((files) => {
		projectFiles = files;
	});

	let pendingApproval: {
		resolve: (approved: boolean) => void;
		questionText: string;
	} | null = null;

	function renderPalette() {
		renderCommandPalette(commandPalette, paletteCommands, paletteSelectedIndex);
	}

	function updatePalette() {
		if (pendingApproval) {
			activeMentionToken = null;
			paletteCommands = [];
			renderPalette();
			return;
		}
		activeMentionToken = findActiveMentionToken(
			input.value,
			input.selectionStart ?? input.value.length,
		);
		paletteCommands = activeMentionToken
			? matchingFiles(activeMentionToken.query, projectFiles)
			: matchingCommands(input.value);
		if (paletteSelectedIndex >= paletteCommands.length) {
			paletteSelectedIndex = 0;
		}
		renderPalette();
	}

	function closePalette() {
		activeMentionToken = null;
		paletteCommands = [];
		paletteSelectedIndex = 0;
		renderPalette();
	}

	const promptRow = document.createElement("div");
	promptRow.className = "prompt-row";
	const sigil = document.createElement("span");
	sigil.className = "sigil";
	sigil.textContent = "›";

	const inputWrap = document.createElement("div");
	inputWrap.className = "input-wrap";

	const input = document.createElement("textarea");
	input.placeholder = "e.g., refactor auth.ts to use JWT tokens";
	input.value =
		"add a logger method to my server to log headers\n/Users/poorshad/Desktop/projects/sattel/tests/server.js";

	// TermDOM's <textarea> only picks up its own text color at creation
	// time — toggling a class or color afterwards updates the box but not
	// the already-painted value text. So the real textarea's typed text is
	// always kept invisible (matching the background), and a plain `div`
	// overlay mirrors it on top with per-substring coloring, since regular
	// elements DO update their styling live.
	const overlay = document.createElement("div");
	overlay.className = "input-overlay";

	const MAX_INPUT_ROWS = 8;

	function computeRows(value: string): number {
		const lines = value.split("\n").length;
		return Math.min(MAX_INPUT_ROWS, Math.max(1, lines));
	}

	function renderOverlay() {
		while (overlay.firstChild) {
			overlay.removeChild(overlay.firstChild);
		}
		const value = input.value;
		const match = findCommandMatch(value);
		if (!match) {
			overlay.appendChild(document.createTextNode(value));
			return;
		}
		const before = value.slice(0, match.start);
		const command = value.slice(match.start, match.end);
		const after = value.slice(match.end);
		if (before) {
			overlay.appendChild(document.createTextNode(before));
		}
		const commandSpan = document.createElement("span");
		commandSpan.className = "command";
		commandSpan.textContent = command;
		overlay.appendChild(commandSpan);
		if (after) {
			overlay.appendChild(document.createTextNode(after));
		}
	}

	function syncInput() {
		input.rows = computeRows(input.value);
		renderOverlay();
		updatePalette();
	}
	input.addEventListener("input", syncInput);
	syncInput();

	inputWrap.appendChild(input);
	inputWrap.appendChild(overlay);
	promptRow.appendChild(sigil);
	promptRow.appendChild(inputWrap);
	document.body.appendChild(promptRow);

	const hint = document.createElement("div");
	hint.className = "hint";
	hint.textContent = "↵ send   ^J newline   ⇥ complete   esc exit";
	document.body.appendChild(hint);

	function appendEntry(text: string, className: string) {
		const entry = document.createElement("div");
		entry.className = `entry ${className}`;
		entry.textContent = text;
		log.appendChild(entry);
		entry.scrollIntoView();
		return entry;
	}

	function endSession() {
		term.dispose().then(() => process.exit(0));
	}

	let conversationState: ConversationState | null = null;
	const sessionState: StateAccessor = {
		load: async () => conversationState,
		save: async (state) => {
			conversationState = state;
		},
	};

	let initConversationState: ConversationState | null = null;
	const initSessionState: StateAccessor = {
		load: async () => initConversationState,
		save: async (state) => {
			initConversationState = state;
		},
	};

	function startNewSession() {
		if (pendingApproval) {
			pendingApproval.resolve(false);
			pendingApproval = null;
			input.placeholder = "e.g., refactor auth.ts to use JWT tokens";
		}
		conversationState = null;
		while (log.firstChild) {
			log.removeChild(log.firstChild);
		}
		appendEntry("✔ Started a new session.", "outro");
	}

	function askYesNo(questionText: string): Promise<boolean> {
		appendEntry(questionText, "approval-prompt");
		input.placeholder = "y/n";
		return new Promise((resolve) => {
			pendingApproval = { resolve, questionText };
		});
	}

	async function consumeAssistantStream(
		result: ReturnType<typeof testStreamingLLM>,
	): Promise<string | undefined> {
		let lastMessageText: string | undefined;
		const toolCallsMap = new Map<
			string,
			{ el: HTMLElement; stop: () => void; verb: string }
		>();

		let thinkingEl: HTMLElement | null = null;
		let stopThinkingSpinner: (() => void) | null = null;

		function showThinking() {
			if (thinkingEl) return;
			thinkingEl = appendEntry("", "thinking");
			stopThinkingSpinner = startSpinner((frame) => {
				if (thinkingEl) {
					thinkingEl.textContent = `${frame} Thinking…`;
				}
			});
		}

		function hideThinking() {
			if (stopThinkingSpinner) {
				stopThinkingSpinner();
				stopThinkingSpinner = null;
			}
			if (thinkingEl) {
				thinkingEl.remove();
				thinkingEl = null;
			}
		}

		showThinking();

		for await (const item of result.getItemsStream()) {
			switch (item.type) {
				case "message":
					if (item.status === "completed") {
						hideThinking();
						const text = item.content
							? item.content[0]
								? (item.content[0] as { text: string }).text
								: ""
							: "";
						lastMessageText = text;
						appendEntry(text, "message");
					} else {
						showThinking();
					}
					break;
				case "function_call": {
					const callId = item.callId || "";
					if (item.status === "in_progress" && !toolCallsMap.has(callId)) {
						hideThinking();
						const verb = toolVerb(item.name);
						const el = appendEntry("", "tool-box");
						const stop = startSpinner((frame) => {
							el.textContent = `${frame} ${verb}`;
						});
						toolCallsMap.set(callId, { el, stop, verb });
						break;
					}
					if (item.status === "completed") {
						const call = toolCallsMap.get(callId);
						if (call) {
							call.stop();
							const target = describeToolCallJson(item.name, item.arguments);
							call.el.className = "entry tool-box done";
							call.el.textContent = `${call.verb} → ${target}`;
						}
						break;
					}
					break;
				}
				case "reasoning":
					showThinking();
					break;
				case "function_call_output":
					// no-op: tool output is reflected by the tool box above
					break;
			}
		}

		hideThinking();
		return lastMessageText;
	}

	async function resolvePendingApprovals(
		result: ReturnType<typeof testStreamingLLM>,
		tools: Tool[],
		state: StateAccessor,
		lastMessageText?: string,
	): Promise<string | undefined> {
		while (await result.requiresApproval()) {
			const pending = await result.getPendingToolCalls();
			const approveToolCalls: string[] = [];
			const rejectToolCalls: string[] = [];

			for (const call of pending) {
				const approved = await askYesNo(
					`Allow: ${describeToolCall(call.name, call.arguments)}? (y/n)`,
				);
				if (approved) {
					approveToolCalls.push(call.id);
					if (call.name === "shell") {
						const { command, args } = call.arguments as {
							command: string;
							args: string[];
						};
						recordAllowedShellCommand(computeShellCommandKey(command, args));
					}
				} else {
					rejectToolCalls.push(call.id);
				}
			}

			result = resumeAfterApproval(tools, state, {
				approveToolCalls,
				rejectToolCalls,
			});
			lastMessageText = await consumeAssistantStream(result);
		}
		return lastMessageText;
	}

	async function handlePrompt(userPrompt: string) {
		appendEntry(userPrompt, "you");

		const result = testStreamingLLM(userPrompt, TOOLS, sessionState);
		const firstText = await consumeAssistantStream(result);
		await resolvePendingApprovals(result, TOOLS, sessionState, firstText);

		appendEntry("✔ Done! Your code has been updated successfully.", "outro");
	}

	async function runInitFlow() {
		appendEntry("/init", "you");

		if (projectInstructionsFileExists()) {
			appendEntry(
				"✘ CLAUDE.md already exists — not overwriting. Delete or rename it first if you want to regenerate.",
				"outro",
			);
			return;
		}

		const result = runInit(INIT_TOOLS, initSessionState);
		const firstText = await consumeAssistantStream(result);
		const finalText = await resolvePendingApprovals(
			result,
			INIT_TOOLS,
			initSessionState,
			firstText,
		);

		if (!finalText) {
			appendEntry(
				"✘ init produced no content — CLAUDE.md was not written.",
				"outro",
			);
			return;
		}

		writeProjectInstructions(finalText);
		invalidateProjectInstructionsCache();
		appendEntry("✔ Wrote CLAUDE.md.", "outro");
	}

	input.addEventListener(
		"keydown",
		(ev) => {
			if (pendingApproval) {
				if (ev.key !== "Enter" && ev.key !== "Escape") {
					return;
				}
				ev.preventDefault();

				if (ev.key === "Escape") {
					const { resolve } = pendingApproval;
					pendingApproval = null;
					input.placeholder = "e.g., refactor auth.ts to use JWT tokens";
					resolve(false);
					return;
				}

				const value = input.value;
				if (matchesAny(value, EXIT_COMMANDS)) {
					input.value = "";
					syncInput();
					endSession();
					return;
				}

				const answer = value.trim().toLowerCase();
				input.value = "";
				syncInput();

				if (answer === "y" || answer === "yes") {
					appendEntry(answer, "you");
					const { resolve } = pendingApproval;
					pendingApproval = null;
					input.placeholder = "e.g., refactor auth.ts to use JWT tokens";
					resolve(true);
				} else if (answer === "n" || answer === "no") {
					appendEntry(answer, "you");
					const { resolve } = pendingApproval;
					pendingApproval = null;
					input.placeholder = "e.g., refactor auth.ts to use JWT tokens";
					resolve(false);
				} else {
					appendEntry(
						`Please answer y or n. ${pendingApproval.questionText}`,
						"approval-prompt",
					);
				}
				return;
			}
			if (ev.key === "Tab" && paletteCommands.length > 0) {
				ev.preventDefault();
				const selected = paletteCommands[paletteSelectedIndex];
				if (activeMentionToken) {
					const { start, end } = activeMentionToken;
					const inserted = `@${selected.name} `;
					input.value = `${input.value.slice(0, start)}${inserted}${input.value.slice(end)}`;
					input.setSelectionRange(
						start + inserted.length,
						start + inserted.length,
					);
				} else {
					input.value = `${selected.name} `;
					input.setSelectionRange(input.value.length, input.value.length);
				}
				syncInput();
			} else if (ev.key === "ArrowDown" && paletteCommands.length > 0) {
				ev.preventDefault();
				paletteSelectedIndex =
					(paletteSelectedIndex + 1) % paletteCommands.length;
				renderPalette();
			} else if (ev.key === "ArrowUp" && paletteCommands.length > 0) {
				ev.preventDefault();
				paletteSelectedIndex =
					(paletteSelectedIndex - 1 + paletteCommands.length) %
					paletteCommands.length;
				renderPalette();
			} else if (ev.key === "Enter") {
				ev.preventDefault();
				if (paletteCommands.length > 0) {
					const selected = paletteCommands[paletteSelectedIndex];
					if (activeMentionToken) {
						const { start, end } = activeMentionToken;
						input.value = `${input.value.slice(0, start)}@${selected.name} ${input.value.slice(end)}`;
					} else {
						input.value = selected.name;
					}
					closePalette();
				}

				const value = input.value;
				input.value = "";
				syncInput();

				if (!value.trim()) {
					return;
				}
				if (matchesAny(value, EXIT_COMMANDS)) {
					endSession();
					return;
				}
				if (matchesAny(value, RESET_COMMANDS)) {
					startNewSession();
					return;
				}
				if (matchesAny(value, INIT_COMMANDS)) {
					runInitFlow();
					return;
				}
				handlePrompt(value);
			} else if (ev.key === "j" && ev.ctrlKey) {
				ev.preventDefault();
				const start = input.selectionStart ?? input.value.length;
				const end = input.selectionEnd ?? input.value.length;
				input.value = `${input.value.slice(0, start)}\n${input.value.slice(end)}`;
				input.setSelectionRange(start + 1, start + 1);
				syncInput();
			} else if (ev.key === "Escape") {
				if (paletteCommands.length > 0) {
					ev.preventDefault();
					closePalette();
				} else {
					endSession();
				}
			} else if (ev.key === "c" && ev.ctrlKey) {
				endSession();
			}
		},
		{ capture: true },
	);

	input.focus();
}

main();
