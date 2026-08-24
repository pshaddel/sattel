import { TermDOM } from "@b9g/termdom";
import type { ConversationState, StateAccessor } from "@openrouter/agent";
import { testStreamingLLM } from "./llm/llm";
import { extractPath, shortenPath, toolVerb } from "./tools/file.helper";
import { readFileTool, writeFileTool } from "./tools/file";
import {
	EXIT_COMMANDS,
	RESET_COMMANDS,
	findCommandMatch,
	matchesAny,
} from "./ui/command-highlighter";
import { startSpinner } from "./ui/spinner";
import { STYLES } from "./ui/styles";

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
	hint.textContent = "↵ send   ^J newline   esc exit";
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

	function startNewSession() {
		conversationState = null;
		while (log.firstChild) {
			log.removeChild(log.firstChild);
		}
		appendEntry("✔ Started a new session.", "outro");
	}

	async function handlePrompt(userPrompt: string) {
		appendEntry(userPrompt, "you");

		const result = testStreamingLLM(
			userPrompt,
			[readFileTool, writeFileTool],
			sessionState,
		);

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
						appendEntry(
							item.content
								? item.content[0]
									? (item.content[0] as { text: string }).text
									: ""
								: "",
							"message",
						);
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
							const path = extractPath(item.arguments);
							const target = path ? shortenPath(path) : item.arguments;
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
		appendEntry("✔ Done! Your code has been updated successfully.", "outro");
	}

	input.addEventListener(
		"keydown",
		(ev) => {
			if (ev.key === "Enter") {
				ev.preventDefault();
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
				handlePrompt(value);
			} else if (ev.key === "j" && ev.ctrlKey) {
				ev.preventDefault();
				const start = input.selectionStart ?? input.value.length;
				const end = input.selectionEnd ?? input.value.length;
				input.value = `${input.value.slice(0, start)}\n${input.value.slice(end)}`;
				input.setSelectionRange(start + 1, start + 1);
				syncInput();
			} else if (ev.key === "Escape" || (ev.key === "c" && ev.ctrlKey)) {
				endSession();
			}
		},
		{ capture: true },
	);

	input.focus();
}

main();
