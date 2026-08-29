import { describe, expect, test } from "bun:test";
import {
	type CodeToken,
	type MessageSegment,
	parseMessageMarkdown,
} from "../../src/ui/message-formatter";

/** Reassembles the original characters from a segment tree, for edge cases
 * where exact segment shape doesn't matter as much as not losing/mangling
 * text. `break` segments stand in for the `\n` the renderer reinserts. */
function flattenText(segments: MessageSegment[]): string {
	return segments
		.map((segment) => {
			switch (segment.kind) {
				case "break":
					return "\n";
				case "heading":
				case "list-item":
					return flattenText(segment.children);
				case "code-block":
				case "text":
				case "bold":
				case "italic":
				case "code":
					return segment.text;
				default:
					return "";
			}
		})
		.join("");
}

/** Concatenates every text leaf in a code-block's token tree, to check the
 * highlighter's tokens round-trip the original code without losing/altering
 * characters, regardless of exactly how it chose to tokenize them. */
function flattenTokens(tokens: CodeToken[]): string {
	return tokens
		.map((token) =>
			token.type === "text" ? token.value : flattenTokens(token.children),
		)
		.join("");
}

/** Collects every className used anywhere in a code-block's token tree, to
 * check real per-token highlighting classes (not just plain text) came
 * back for a known language/snippet. */
function collectClassNames(tokens: CodeToken[]): string[] {
	return tokens.flatMap((token) =>
		token.type === "text"
			? []
			: [...token.className, ...collectClassNames(token.children)],
	);
}

describe("parseMessageMarkdown", () => {
	test("returns a single text segment for plain text with no markdown", () => {
		expect(parseMessageMarkdown("just plain text")).toEqual([
			{ kind: "text", text: "just plain text" },
		]);
	});

	test("returns an empty array for an empty string", () => {
		expect(parseMessageMarkdown("")).toEqual([]);
	});

	test("parses inline code", () => {
		expect(parseMessageMarkdown("run `bun test` now")).toEqual([
			{ kind: "text", text: "run " },
			{ kind: "code", text: "bun test" },
			{ kind: "text", text: " now" },
		]);
	});

	test("parses bold text", () => {
		expect(parseMessageMarkdown("this is **important**")).toEqual([
			{ kind: "text", text: "this is " },
			{ kind: "bold", text: "important" },
		]);
	});

	test("parses italic text with asterisks", () => {
		expect(parseMessageMarkdown("*note* this")).toEqual([
			{ kind: "italic", text: "note" },
			{ kind: "text", text: " this" },
		]);
	});

	test("parses italic text with underscores", () => {
		expect(parseMessageMarkdown("_note_ this")).toEqual([
			{ kind: "italic", text: "note" },
			{ kind: "text", text: " this" },
		]);
	});

	test("preserves order across mixed inline formatting in one line", () => {
		expect(parseMessageMarkdown("a **b** c `d` e *f*")).toEqual([
			{ kind: "text", text: "a " },
			{ kind: "bold", text: "b" },
			{ kind: "text", text: " c " },
			{ kind: "code", text: "d" },
			{ kind: "text", text: " e " },
			{ kind: "italic", text: "f" },
		]);
	});

	test("parses a fenced code block with a language tag", () => {
		expect(parseMessageMarkdown("```ts\nconst x = 1;\n```")).toEqual([
			{
				kind: "code-block",
				text: "const x = 1;",
				language: "ts",
				tokens: expect.any(Array),
			},
		]);
	});

	test("parses a fenced code block with no language tag", () => {
		expect(parseMessageMarkdown("```\nplain code\n```")).toEqual([
			{
				kind: "code-block",
				text: "plain code",
				language: undefined,
				tokens: expect.any(Array),
			},
		]);
	});

	test("parses multiple code blocks with prose in between", () => {
		expect(parseMessageMarkdown("```js\na\n```\nthen\n```py\nb\n```")).toEqual([
			{
				kind: "code-block",
				text: "a",
				language: "js",
				tokens: expect.any(Array),
			},
			{ kind: "break" },
			{ kind: "text", text: "then" },
			{ kind: "break" },
			{
				kind: "code-block",
				text: "b",
				language: "py",
				tokens: expect.any(Array),
			},
		]);
	});

	test("does not treat a line starting with # or - inside a code block as a heading or list item", () => {
		expect(
			parseMessageMarkdown("```\n# not a heading\n- not a list\n```"),
		).toEqual([
			{
				kind: "code-block",
				text: "# not a heading\n- not a list",
				language: undefined,
				tokens: expect.any(Array),
			},
		]);
	});

	test("tokenizes a known language into real highlight.js token classes, not flat text", () => {
		const [codeBlock] = parseMessageMarkdown(
			"```js\n// a comment\nfunction add(a, b) { return a + b; }\n```",
		);
		if (codeBlock.kind !== "code-block") {
			throw new Error("expected a code-block segment");
		}
		expect(collectClassNames(codeBlock.tokens)).toEqual(
			expect.arrayContaining(["hljs-comment", "hljs-keyword"]),
		);
	});

	test("tokenizing a code block never drops or alters the original characters", () => {
		const code = "function add(a, b) {\n  return a + b;\n}";
		const [codeBlock] = parseMessageMarkdown(`\`\`\`js\n${code}\n\`\`\``);
		if (codeBlock.kind !== "code-block") {
			throw new Error("expected a code-block segment");
		}
		expect(flattenTokens(codeBlock.tokens)).toBe(code);
	});

	test.each([1, 2, 3, 4, 5, 6])("parses a level-%d heading", (level) => {
		const marker = "#".repeat(level);
		expect(parseMessageMarkdown(`${marker} Title`)).toEqual([
			{ kind: "heading", level, children: [{ kind: "text", text: "Title" }] },
		]);
	});

	test("parses inline formatting inside a heading into its children", () => {
		expect(parseMessageMarkdown("## Use **bold** here")).toEqual([
			{
				kind: "heading",
				level: 2,
				children: [
					{ kind: "text", text: "Use " },
					{ kind: "bold", text: "bold" },
					{ kind: "text", text: " here" },
				],
			},
		]);
	});

	test("parses a list item with a - marker", () => {
		expect(parseMessageMarkdown("- first item")).toEqual([
			{ kind: "list-item", children: [{ kind: "text", text: "first item" }] },
		]);
	});

	test("parses a list item with a * marker", () => {
		expect(parseMessageMarkdown("* first item")).toEqual([
			{ kind: "list-item", children: [{ kind: "text", text: "first item" }] },
		]);
	});

	test("parses inline formatting inside a list item into its children", () => {
		expect(parseMessageMarkdown("- run `bun test`")).toEqual([
			{
				kind: "list-item",
				children: [
					{ kind: "text", text: "run " },
					{ kind: "code", text: "bun test" },
				],
			},
		]);
	});

	test("emits a break segment between prose lines and around a code block, so it starts and ends on its own line", () => {
		expect(
			parseMessageMarkdown("line one\nline two\n```\ncode\n```\nafter"),
		).toEqual([
			{ kind: "text", text: "line one" },
			{ kind: "break" },
			{ kind: "text", text: "line two" },
			{ kind: "break" },
			{
				kind: "code-block",
				text: "code",
				language: undefined,
				tokens: expect.any(Array),
			},
			{ kind: "break" },
			{ kind: "text", text: "after" },
		]);
	});

	test("does not crash on an unterminated bold marker and preserves the characters", () => {
		expect(flattenText(parseMessageMarkdown("this **never closes"))).toBe(
			"this **never closes",
		);
	});

	test("does not crash on an unterminated inline code marker and preserves the characters", () => {
		expect(flattenText(parseMessageMarkdown("this `never closes"))).toBe(
			"this `never closes",
		);
	});

	test("does not crash on an unterminated fenced code block and preserves the characters", () => {
		expect(flattenText(parseMessageMarkdown("```ts\nno closing fence"))).toBe(
			"```ts\nno closing fence",
		);
	});
});
