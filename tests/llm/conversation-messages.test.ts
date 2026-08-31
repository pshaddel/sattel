import { describe, expect, test } from "bun:test";
import { extractReplayItems } from "../../src/llm/conversation-messages";

describe("extractReplayItems", () => {
	test("extracts a user item with plain string content", () => {
		const messages = [{ type: "message", role: "user", content: "hello" }];
		expect(extractReplayItems(messages)).toEqual([
			{ role: "user", text: "hello" },
		]);
	});

	test("extracts a user item with array content (InputText blocks)", () => {
		const messages = [
			{
				type: "message",
				role: "user",
				content: [{ type: "input_text", text: "hello" }],
			},
		];
		expect(extractReplayItems(messages)).toEqual([
			{ role: "user", text: "hello" },
		]);
	});

	test("extracts an assistant output item (ResponseOutputText blocks)", () => {
		const messages = [
			{
				id: "msg_1",
				type: "message",
				role: "assistant",
				status: "completed",
				content: [{ type: "output_text", text: "hi there" }],
			},
		];
		expect(extractReplayItems(messages)).toEqual([
			{ role: "assistant", text: "hi there" },
		]);
	});

	test("skips non-message items (e.g. function_call)", () => {
		const messages = [
			{ type: "function_call", callId: "1", name: "shell", arguments: "{}" },
			{ type: "message", role: "user", content: "hello" },
		];
		expect(extractReplayItems(messages)).toEqual([
			{ role: "user", text: "hello" },
		]);
	});

	test("skips items with no role or an unrecognized role", () => {
		const messages = [
			{ type: "message", role: "system", content: "be nice" },
			{ type: "reasoning", summary: [] },
			{ type: "message", role: "user", content: "hello" },
		];
		expect(extractReplayItems(messages)).toEqual([
			{ role: "user", text: "hello" },
		]);
	});

	test("skips items whose extracted text is empty", () => {
		const messages = [
			{ type: "message", role: "user", content: null },
			{ type: "message", role: "user", content: "" },
			{ type: "message", role: "user", content: "hello" },
		];
		expect(extractReplayItems(messages)).toEqual([
			{ role: "user", text: "hello" },
		]);
	});

	test("returns an empty array when messages is a bare string", () => {
		expect(extractReplayItems("just a string prompt")).toEqual([]);
	});

	test("returns an empty array for non-array, non-string input", () => {
		expect(extractReplayItems(undefined)).toEqual([]);
		expect(extractReplayItems(null)).toEqual([]);
	});
});
