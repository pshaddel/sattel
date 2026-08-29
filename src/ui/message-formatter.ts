import { common, createLowlight } from "lowlight";

export type InlineSegment =
	| { kind: "text"; text: string }
	| { kind: "bold"; text: string }
	| { kind: "italic"; text: string }
	| { kind: "code"; text: string };

export type CodeToken =
	| { type: "text"; value: string }
	| { type: "element"; className: string[]; children: CodeToken[] };

export type MessageSegment =
	| InlineSegment
	| { kind: "code-block"; text: string; language?: string; tokens: CodeToken[] }
	| { kind: "heading"; level: number; children: InlineSegment[] }
	| { kind: "list-item"; children: InlineSegment[] }
	| { kind: "break" };

interface HastNode {
	type: string;
	value?: string;
	properties?: { className?: string[] };
	children?: HastNode[];
}

const CODE_BLOCK_RE = /```(\S*)\n?([\s\S]*?)```/g;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM_RE = /^\s*[-*]\s+(.*)$/;
const INLINE_RE = /\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_|`([^`]+?)`/g;

const lowlight = createLowlight(common);

function hastToTokens(nodes: HastNode[]): CodeToken[] {
	return nodes.map((node): CodeToken => {
		if (node.type === "text") {
			return { type: "text", value: node.value ?? "" };
		}
		return {
			type: "element",
			className: node.properties?.className ?? [],
			children: hastToTokens(node.children ?? []),
		};
	});
}

/**
 * Runs a fenced code block's content through highlight.js (via lowlight) for
 * real per-token syntax highlighting, matched by the fence's language tag
 * when it names a known language, or auto-detected otherwise. Falls back to
 * a single plain-text token if highlighting itself throws, so a code block
 * never fails to render just because of a malformed language tag.
 */
function tokenizeCode(code: string, language?: string): CodeToken[] {
	try {
		const tree =
			language && lowlight.registered(language)
				? lowlight.highlight(language, code)
				: lowlight.highlightAuto(code);
		return hastToTokens(tree.children as HastNode[]);
	} catch {
		return [{ type: "text", value: code }];
	}
}

/**
 * Splits a line's text on bold/italic/code markers. Matches are not
 * recursive (a match's own captured text is never re-scanned), so nested
 * emphasis like `**bold *italic* bold**` is not specially handled — the
 * inner markers are just left as literal characters of the bold segment.
 * An unterminated marker (e.g. a stray `**` with no closing pair) never
 * matches and falls through to plain text, so it round-trips unchanged
 * rather than throwing or swallowing characters.
 */
function parseInline(text: string): InlineSegment[] {
	if (text === "") {
		return [];
	}
	const segments: InlineSegment[] = [];
	let lastIndex = 0;
	INLINE_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: standard exec-loop idiom
	while ((match = INLINE_RE.exec(text))) {
		if (match.index > lastIndex) {
			segments.push({ kind: "text", text: text.slice(lastIndex, match.index) });
		}
		if (match[1] !== undefined) {
			segments.push({ kind: "bold", text: match[1] });
		} else if (match[2] !== undefined) {
			segments.push({ kind: "italic", text: match[2] });
		} else if (match[3] !== undefined) {
			segments.push({ kind: "italic", text: match[3] });
		} else if (match[4] !== undefined) {
			segments.push({ kind: "code", text: match[4] });
		}
		lastIndex = INLINE_RE.lastIndex;
	}
	if (lastIndex < text.length) {
		segments.push({ kind: "text", text: text.slice(lastIndex) });
	}
	if (segments.length === 0) {
		segments.push({ kind: "text", text });
	}
	return segments;
}

/**
 * Parses a prose chunk (no fenced code blocks inside it) line by line,
 * recognizing a leading `#`-`######` heading marker or `-`/`*` list bullet
 * on each line and stripping it before running the inline parser on the
 * rest. A `break` segment marks each line boundary within the chunk so the
 * renderer knows where to reinsert a line break.
 */
function parseProseLines(text: string): MessageSegment[] {
	const lines = text.split("\n");
	const segments: MessageSegment[] = [];
	lines.forEach((line, index) => {
		if (index > 0) {
			segments.push({ kind: "break" });
		}
		const headingMatch = HEADING_RE.exec(line);
		if (headingMatch) {
			segments.push({
				kind: "heading",
				level: headingMatch[1].length,
				children: parseInline(headingMatch[2]),
			});
			return;
		}
		const listMatch = LIST_ITEM_RE.exec(line);
		if (listMatch) {
			segments.push({ kind: "list-item", children: parseInline(listMatch[1]) });
			return;
		}
		segments.push(...parseInline(line));
	});
	return segments;
}

/**
 * Parses the hand-rolled subset of markdown this CLI's terminal UI renders:
 * fenced code blocks, inline code, bold, italic, headings, and bullet
 * lists. Nothing outside this subset (tables, numbered lists, blockquotes,
 * nested emphasis) is recognized — it's left as literal text rather than
 * misparsed. Fenced code blocks are matched first and their contents are
 * never line-parsed for headings/lists, so a code sample containing a line
 * starting with `#` or `-` is rendered verbatim.
 */
export function parseMessageMarkdown(input: string): MessageSegment[] {
	const segments: MessageSegment[] = [];
	let lastIndex = 0;
	CODE_BLOCK_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: standard exec-loop idiom
	while ((match = CODE_BLOCK_RE.exec(input))) {
		if (match.index > lastIndex) {
			// Left as-is (not stripped): the newline right before this fence is
			// still a real line break between the preceding prose and the code
			// block, and parseProseLines's empty-line handling turns it into a
			// break segment with no text, which is exactly what's needed here.
			segments.push(...parseProseLines(input.slice(lastIndex, match.index)));
		}
		const code = match[2].replace(/\n$/, "");
		const language = match[1] || undefined;
		segments.push({
			kind: "code-block",
			text: code,
			language,
			tokens: tokenizeCode(code, language),
		});
		lastIndex = CODE_BLOCK_RE.lastIndex;
	}
	if (lastIndex < input.length) {
		segments.push(...parseProseLines(input.slice(lastIndex)));
	}
	return segments;
}
