import { TermDOM } from "@b9g/termdom";
import type { ConversationState, StateAccessor, Tool } from "@openrouter/agent";
import packageJson from "../package.json" with { type: "json" };
import { listProjectFiles } from "./context/projectFiles";
import {
	projectInstructionsFileExists,
	writeProjectInstructions,
} from "./context/projectInstructions";
import { getRecentFiles, recordFileMention } from "./db/file.db";
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
import { resolveEscapeAction } from "./ui/escape-action";
import {
	findActiveMentionToken,
	type MentionToken,
	matchingFiles,
} from "./ui/file-mention";
import type {
	CodeToken,
	InlineSegment,
	MessageSegment,
} from "./ui/message-formatter";
import { parseMessageMarkdown } from "./ui/message-formatter";
import { startSpinner } from "./ui/spinner";
import { STYLES } from "./ui/styles";

const TOOLS: Tool[] = [readFileTool, writeFileTool, shellTool];
const INIT_TOOLS: Tool[] = [readFileTool, shellTool];

function isBenignAbortError(err: unknown): boolean {
	return err instanceof Error && err.name === "AbortError";
}

// Switches the terminal to the alternate screen buffer (the same mechanism
// vim/less/htop use), so the shell's existing scrollback is hidden behind
// Sattel's screen instead of sitting above it and interfering with the log's
// own PageUp/PageDown scrolling. Deliberately raw ANSI rather than termdom's
// Fullscreen API (`element.requestFullscreen()`): that API's global Escape
// handler intercepts Escape whenever a text field is focused (our `input` is
// always focused) and blurs it instead of dispatching a keydown event, which
// would silently break this app's own Escape-to-cancel/close-palette
// handling. Writing the raw codes ourselves leaves termdom's
// `kFullscreenManager` state untouched, so that interception never engages.
function enterAltScreen() {
	process.stdout.write("\x1B[?1049h\x1B[2J\x1B[H");
}

function exitAltScreen() {
	process.stdout.write("\x1B[?25h\x1B[?1049l");
}

// Cancelling an in-flight turn via Escape calls AbortController.abort(),
// which in this environment (Bun + @b9g/termdom's synthetic DOM) can surface
// as an uncaught/unhandled AbortError instead of propagating through the
// normal call stack a local try/catch would see — the abort event's listener
// exception is reported globally rather than thrown back to the abort()
// caller. Swallow only that specific, expected error here so cancelling a
// turn can never crash Sattel; anything else still crashes loudly.
process.on("uncaughtException", (err) => {
	if (isBenignAbortError(err)) return;
	exitAltScreen();
	console.error(err);
	process.exit(1);
});

process.on("unhandledRejection", (reason) => {
	if (isBenignAbortError(reason)) return;
	exitAltScreen();
	console.error(reason);
	process.exit(1);
});

async function main() {
	enterAltScreen();
	const term = new TermDOM();
	await term.attach();
	const { document } = term;

	const style = document.createElement("style");
	style.textContent = STYLES;
	document.head.appendChild(style);

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

	let activeTurn: AbortController | null = null;

	function renderPalette() {
		renderCommandPalette(commandPalette, paletteCommands, paletteSelectedIndex);
	}

	// When the user has just typed a bare `@` (no query yet), show their most
	// recently mentioned files instead of the alphabetical project listing.
	// Falls back to that listing when there's no mention history yet (fresh
	// project, or the DB read failed) so the palette is never empty.
	function recentFileMentionCommands(): CommandDef[] {
		const recent = getRecentFiles();
		return recent.length > 0
			? recent.map((file) => ({ name: file, description: "" }))
			: matchingFiles("", projectFiles);
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
			? activeMentionToken.query === ""
				? recentFileMentionCommands()
				: matchingFiles(activeMentionToken.query, projectFiles)
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
	hint.textContent =
		"↵ send   ^J newline   ⇥ complete   PgUp/PgDn scroll   esc cancel   ^C quit";
	document.body.appendChild(hint);

	appendEntry(`[logo]\n\nSattel v${packageJson.version}\n\n`, "header");

	function renderInlineNode(segment: InlineSegment) {
		if (segment.kind === "text") {
			return document.createTextNode(segment.text);
		}
		const span = document.createElement("span");
		span.className = `md-${segment.kind}`;
		span.textContent = segment.text;
		return span;
	}

	function renderCodeToken(token: CodeToken) {
		if (token.type === "text") {
			return document.createTextNode(token.value);
		}
		const span = document.createElement("span");
		span.className = token.className.join(" ");
		for (const child of token.children) {
			span.appendChild(renderCodeToken(child));
		}
		return span;
	}

	function renderSegmentNode(segment: MessageSegment) {
		switch (segment.kind) {
			case "text":
			case "bold":
			case "italic":
			case "code":
				return renderInlineNode(segment);
			case "code-block": {
				const span = document.createElement("span");
				span.className = "md-code-block";
				for (const token of segment.tokens) {
					span.appendChild(renderCodeToken(token));
				}
				return span;
			}
			case "heading": {
				const span = document.createElement("span");
				span.className = "md-heading";
				for (const child of segment.children) {
					span.appendChild(renderInlineNode(child));
				}
				return span;
			}
			case "list-item": {
				const span = document.createElement("span");
				span.className = "md-list-item";
				span.appendChild(document.createTextNode("• "));
				for (const child of segment.children) {
					span.appendChild(renderInlineNode(child));
				}
				return span;
			}
			case "break":
				return document.createTextNode("\n");
		}
	}

	// Assistant messages are re-rendered from scratch on every streamed
	// update (see the "message" case in consumeAssistantStream below), since
	// each event carries the full text so far rather than a delta.
	function renderMessageText(entry: HTMLElement, text: string) {
		while (entry.firstChild) {
			entry.removeChild(entry.firstChild);
		}
		for (const segment of parseMessageMarkdown(text)) {
			entry.appendChild(renderSegmentNode(segment));
		}
	}

	// Whether the log is currently scrolled to (or within a hair of) the
	// bottom. Used to decide whether new/growing content should pull the
	// view down with it, so a user who scrolled up to reread earlier
	// output isn't yanked back down on every update.
	function isLogAtBottom(): boolean {
		return log.scrollTop + log.clientHeight >= log.scrollHeight - 1;
	}

	// Runs `mutate`, then re-pins the log to its bottom if (and only if) it
	// was already at the bottom beforehand. Every place that appends a new
	// entry or grows an existing entry's content in place should go
	// through this so long/streamed output keeps scrolling into view.
	function withAutoScroll(mutate: () => void) {
		const wasAtBottom = isLogAtBottom();
		mutate();
		// Only reassign scrollTop once content genuinely overflows the
		// viewport (scrollHeight > clientHeight). termdom's scrollTop setter
		// clamps against a stale/incorrect max while content still fits
		// entirely on screen, which scrolls a couple of rows past the top
		// and hides the first entries for no reason — skip the assignment
		// in that regime since there's nothing to scroll to anyway.
		if (wasAtBottom && log.scrollHeight > log.clientHeight) {
			log.scrollTop = log.scrollHeight;
		}
	}

	function appendEntry(text: string, className: string) {
		const entry = document.createElement("div");
		entry.className = `entry ${className}`;
		if (className === "message") {
			renderMessageText(entry, text);
		} else {
			entry.textContent = text;
		}
		withAutoScroll(() => {
			log.appendChild(entry);
		});
		return entry;
	}

	function endSession() {
		term.dispose().then(() => {
			exitAltScreen();
			process.exit(0);
		});
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
		controller: AbortController,
	): Promise<string | undefined> {
		let lastMessageText: string | undefined;
		const toolCallsMap = new Map<
			string,
			{ el: HTMLElement; stop: () => void; verb: string }
		>();

		activeTurn = controller;

		let thinkingEl: HTMLElement | null = null;
		let stopThinkingSpinner: (() => void) | null = null;

		function showThinking() {
			if (thinkingEl) return;
			thinkingEl = appendEntry("", "thinking");
			stopThinkingSpinner = startSpinner((frame) => {
				const el = thinkingEl;
				if (el) {
					withAutoScroll(() => {
						el.textContent = `${frame} Thinking…`;
					});
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

		let messageEl: HTMLElement | null = null;
		let messageId: string | null = null;
		let reasoningEl: HTMLElement | null = null;
		let reasoningId: string | null = null;

		showThinking();

		try {
			for await (const item of result.getItemsStream()) {
				switch (item.type) {
					case "message": {
						hideThinking();
						const text = item.content
							? item.content[0]
								? (item.content[0] as { text: string }).text
								: ""
							: "";
						if (item.id !== messageId) {
							messageEl = appendEntry(text, "message");
							messageId = item.id;
						} else if (messageEl) {
							const el = messageEl;
							withAutoScroll(() => {
								renderMessageText(el, text);
							});
						}
						lastMessageText = text;
						if (item.status === "completed") {
							messageEl = null;
							messageId = null;
						}
						break;
					}
					case "function_call": {
						const callId = item.callId || "";
						if (item.status === "in_progress" && !toolCallsMap.has(callId)) {
							hideThinking();
							const verb = toolVerb(item.name);
							const el = appendEntry("", "tool-box");
							const stop = startSpinner((frame) => {
								withAutoScroll(() => {
									el.textContent = `${frame} ${verb}`;
								});
							});
							toolCallsMap.set(callId, { el, stop, verb });
							break;
						}
						if (item.status === "completed") {
							const call = toolCallsMap.get(callId);
							if (call) {
								call.stop();
								const target = describeToolCallJson(item.name, item.arguments);
								withAutoScroll(() => {
									call.el.className = "entry tool-box done";
									call.el.textContent = `${call.verb} → ${target}`;
								});
							}
							break;
						}
						break;
					}
					case "reasoning": {
						hideThinking();
						const text = item.summary?.[0]?.text ?? "";
						if (item.id !== reasoningId) {
							reasoningEl = appendEntry(text, "thinking");
							reasoningId = item.id;
						} else if (reasoningEl) {
							const el = reasoningEl;
							withAutoScroll(() => {
								el.textContent = text;
							});
						}
						if (item.status === "completed") {
							reasoningEl = null;
							reasoningId = null;
						}
						break;
					}
					case "function_call_output":
						// no visible content of its own; keep a generic indicator alive
						// until the next reasoning/message item starts streaming text
						showThinking();
						break;
				}
			}
		} catch (err) {
			if (!controller.signal.aborted) throw err;
		} finally {
			for (const call of toolCallsMap.values()) {
				call.stop();
			}
			hideThinking();
			if (activeTurn === controller) {
				activeTurn = null;
			}
		}

		return lastMessageText;
	}

	async function resolvePendingApprovals(
		result: ReturnType<typeof testStreamingLLM>,
		tools: Tool[],
		state: StateAccessor,
		controller: AbortController,
		lastMessageText?: string,
	): Promise<string | undefined> {
		while (!controller.signal.aborted && (await result.requiresApproval())) {
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

			result = resumeAfterApproval(
				tools,
				state,
				{ approveToolCalls, rejectToolCalls },
				controller.signal,
			);
			lastMessageText = await consumeAssistantStream(result, controller);
		}
		return lastMessageText;
	}

	async function handlePrompt(userPrompt: string) {
		appendEntry(userPrompt, "you");

		const controller = new AbortController();
		const result = testStreamingLLM(
			userPrompt,
			TOOLS,
			sessionState,
			controller.signal,
		);
		const firstText = await consumeAssistantStream(result, controller);
		await resolvePendingApprovals(
			result,
			TOOLS,
			sessionState,
			controller,
			firstText,
		);

		// appendEntry("✔ Done! Your code has been updated successfully.", "outro");
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

		const controller = new AbortController();
		const result = runInit(INIT_TOOLS, initSessionState, controller.signal);
		const firstText = await consumeAssistantStream(result, controller);
		const finalText = await resolvePendingApprovals(
			result,
			INIT_TOOLS,
			initSessionState,
			controller,
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
			if (ev.key === "PageUp") {
				ev.preventDefault();
				log.scrollTop -= log.clientHeight;
				return;
			}
			if (ev.key === "PageDown") {
				ev.preventDefault();
				log.scrollTop += log.clientHeight;
				return;
			}
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
					recordFileMention(selected.name);
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
						recordFileMention(selected.name);
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
				const action = resolveEscapeAction({
					paletteOpen: paletteCommands.length > 0,
					hasActiveTurn: activeTurn !== null,
					turnCancelled: activeTurn?.signal.aborted ?? false,
				});
				switch (action) {
					case "close-palette":
						ev.preventDefault();
						closePalette();
						break;
					case "cancel-turn":
						ev.preventDefault();
						try {
							activeTurn?.abort();
						} catch {
							// In this environment abort() can itself throw
							// synchronously (an in-flight request's own abort
							// handling rejects before abort() returns).
							// signal.aborted is already true by the time that
							// happens, so cancellation still takes effect —
							// only the crash needs suppressing.
						}
						appendEntry("✘ Cancelled.", "outro");
						input.focus();
						break;
					case "ignore":
						ev.preventDefault();
						break;
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
