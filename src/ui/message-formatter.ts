export type InlineSegment =
	| { kind: "text"; text: string }
	| { kind: "bold"; text: string }
	| { kind: "italic"; text: string }
	| { kind: "code"; text: string };

export type MessageSegment =
	| InlineSegment
	| { kind: "code-block"; text: string; language?: string }
	| { kind: "heading"; level: number; children: InlineSegment[] }
	| { kind: "list-item"; children: InlineSegment[] }
	| { kind: "break" };

const CODE_BLOCK_RE = /```(\S*)\n?([\s\S]*?)```/g;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM_RE = /^\s*[-*]\s+(.*)$/;
const INLINE_RE = /\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_|`([^`]+?)`/g;

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
			// The newline directly before/after a fence is the block boundary
			// itself, not a prose line break — drop it so it doesn't produce a
			// spurious blank line/break segment around the code block.
			let prose = input.slice(lastIndex, match.index);
			if (lastIndex > 0 && prose.startsWith("\n")) {
				prose = prose.slice(1);
			}
			if (prose.endsWith("\n")) {
				prose = prose.slice(0, -1);
			}
			if (prose) {
				segments.push(...parseProseLines(prose));
			}
		}
		segments.push({
			kind: "code-block",
			text: match[2].replace(/\n$/, ""),
			language: match[1] || undefined,
		});
		lastIndex = CODE_BLOCK_RE.lastIndex;
	}
	if (lastIndex < input.length) {
		let prose = input.slice(lastIndex);
		if (lastIndex > 0 && prose.startsWith("\n")) {
			prose = prose.slice(1);
		}
		if (prose) {
			segments.push(...parseProseLines(prose));
		}
	}
	return segments;
}
