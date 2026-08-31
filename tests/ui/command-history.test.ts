import { describe, expect, test } from "bun:test";
import { resolveHistoryNav } from "../../src/ui/command-history";

describe("resolveHistoryNav", () => {
	test("ArrowUp on an empty box with history steps to the most recent entry", () => {
		expect(
			resolveHistoryNav("ArrowUp", "", { history: ["a", "b", "c"], index: -1 }),
		).toEqual({ handled: true, index: 2, value: "c" });
	});

	test("ArrowUp again while navigating steps further back", () => {
		expect(
			resolveHistoryNav("ArrowUp", "c", { history: ["a", "b", "c"], index: 2 }),
		).toEqual({ handled: true, index: 1, value: "b" });
	});

	test("ArrowUp clamps at the oldest entry", () => {
		expect(
			resolveHistoryNav("ArrowUp", "a", { history: ["a", "b", "c"], index: 0 }),
		).toEqual({ handled: true, index: 0, value: "a" });
	});

	test("ArrowUp refuses to engage on a non-empty, non-navigating box", () => {
		expect(
			resolveHistoryNav("ArrowUp", "some draft", {
				history: ["a", "b", "c"],
				index: -1,
			}),
		).toEqual({ handled: false });
	});

	test("ArrowUp refuses to engage when there is no history", () => {
		expect(
			resolveHistoryNav("ArrowUp", "", { history: [], index: -1 }),
		).toEqual({ handled: false });
	});

	test("ArrowDown while navigating steps forward", () => {
		expect(
			resolveHistoryNav("ArrowDown", "b", {
				history: ["a", "b", "c"],
				index: 1,
			}),
		).toEqual({ handled: true, index: 2, value: "c" });
	});

	test("ArrowDown past the newest entry returns to an empty box", () => {
		expect(
			resolveHistoryNav("ArrowDown", "c", {
				history: ["a", "b", "c"],
				index: 2,
			}),
		).toEqual({ handled: true, index: -1, value: "" });
	});

	test("ArrowDown is a no-op when not navigating", () => {
		expect(
			resolveHistoryNav("ArrowDown", "", {
				history: ["a", "b", "c"],
				index: -1,
			}),
		).toEqual({ handled: false });
	});
});
