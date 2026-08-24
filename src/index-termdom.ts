import { TermDOM } from "@b9g/termdom";
import type { ConversationState, StateAccessor } from "@openrouter/agent";
import { testStreamingLLM } from "./llm/llm";
import { readFileTool, writeFileTool } from "./tools/file";

const SPINNER_FRAMES = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];

const EXIT_COMMANDS = ["/exit", "/quit"];
const RESET_COMMANDS = ["/new", "/init", "/reset"];

function matchesAny(value: string, commands: string[]): boolean {
	return commands.some((command) => value.includes(command));
}

function toolVerb(name: string): string {
	switch (name) {
		case "readFile":
			return "Read";
		case "writeFile":
			return "Write";
		default:
			return name;
	}
}

function extractPath(argumentsJson: string): string | null {
	try {
		const parsed = JSON.parse(argumentsJson);
		return typeof parsed?.path === "string" ? parsed.path : null;
	} catch {
		return null;
	}
}

function shortenPath(path: string, keepSegments = 2): string {
	const parts = path.split("/").filter(Boolean);
	if (parts.length <= keepSegments) return path;
	return `.../${parts.slice(-keepSegments).join("/")}`;
}

const STYLES = `
  html, body { background-color: #0c0c0c; color: #e0e0e0; }
  body {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }
  .banner {
    background-color: cyan;
    color: black;
    font-weight: bold;
    padding: 0 1ch;
  }
  .log {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    flex-grow: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 1ch;
  }
  .entry { margin-bottom: 1; white-space: pre-wrap; }
  .entry.you { color: #5fafff; }
  .entry.message { color: #e0e0e0; }
  .entry.thinking { color: #666666; font-style: italic; }
  .entry.tool-box {
    align-self: flex-start;
    white-space: nowrap;
    border-left: 2px solid #3a3a3a;
    padding-left: 1ch;
    margin-bottom: 0;
    color: #9a9a9a;
  }
  .entry.tool-box.done {
    border-left-color: #4a4a4a;
    color: #d0d0d0;
  }
  .entry.outro { color: green; font-weight: bold; }
  .prompt-row {
    display: flex;
    align-items: center;
    border-top: 1px solid #444444;
    padding: 0 1ch;
  }
  .sigil { color: cyan; font-weight: bold; padding: 0 1ch 0 0; }
  textarea {
    flex-grow: 1;
    background-color: #0c0c0c;
    color: #e0e0e0;
    border: none;
  }
  textarea.command-exit { color: #ff5f5f; font-weight: bold; }
  textarea.command-reset { color: #5fff87; font-weight: bold; }
  .hint {
    color: #555555;
    padding: 0 1ch;
  }
`;

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
	const input = document.createElement("textarea");
	input.rows = 1;
	input.placeholder = "e.g., refactor auth.ts to use JWT tokens";
	input.value =
		"add a logger method to my server to log headers\n/Users/poorshad/Desktop/projects/sattel/tests/server.js";
	promptRow.appendChild(sigil);
	promptRow.appendChild(input);
	document.body.appendChild(promptRow);

	const hint = document.createElement("div");
	hint.className = "hint";
	hint.textContent = "↵ send   ^J newline   esc exit";
	document.body.appendChild(hint);

	const MAX_INPUT_ROWS = 8;
	function syncInputRows() {
		const lines = input.value.split("\n").length;
		input.rows = Math.min(MAX_INPUT_ROWS, Math.max(1, lines));
	}
	function syncCommandHighlight() {
		const value = input.value;
		input.classList.toggle("command-exit", matchesAny(value, EXIT_COMMANDS));
		input.classList.toggle(
			"command-reset",
			matchesAny(value, RESET_COMMANDS),
		);
	}
	function syncInput() {
		syncInputRows();
		syncCommandHighlight();
	}
	input.addEventListener("input", syncInput);
	syncInput();

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
			{ el: HTMLElement; timer: ReturnType<typeof setInterval>; verb: string }
		>();

		let thinkingEl: HTMLElement | null = null;
		let thinkingTimer: ReturnType<typeof setInterval> | null = null;

		function showThinking() {
			if (thinkingEl) return;
			thinkingEl = appendEntry("", "thinking");
			let frame = 0;
			thinkingTimer = setInterval(() => {
				frame = (frame + 1) % SPINNER_FRAMES.length;
				if (thinkingEl) {
					thinkingEl.textContent = `${SPINNER_FRAMES[frame]} Thinking…`;
				}
			}, 80);
		}

		function hideThinking() {
			if (thinkingTimer) {
				clearInterval(thinkingTimer);
				thinkingTimer = null;
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
						let frame = 0;
						const timer = setInterval(() => {
							frame = (frame + 1) % SPINNER_FRAMES.length;
							el.textContent = `${SPINNER_FRAMES[frame]} ${verb}`;
						}, 80);
						toolCallsMap.set(callId, { el, timer, verb });
						break;
					}
					if (item.status === "completed") {
						const call = toolCallsMap.get(callId);
						if (call) {
							clearInterval(call.timer);
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
