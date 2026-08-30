import { describe, expect, test } from "bun:test";
import { resolveEscapeAction } from "../../src/ui/escape-action";

describe("resolveEscapeAction", () => {
	test("closes the palette when it's open, regardless of turn state", () => {
		expect(
			resolveEscapeAction({
				paletteOpen: true,
				hasActiveTurn: false,
				turnCancelled: false,
			}),
		).toBe("close-palette");

		expect(
			resolveEscapeAction({
				paletteOpen: true,
				hasActiveTurn: true,
				turnCancelled: false,
			}),
		).toBe("close-palette");
	});

	test("cancels an active turn on the first Escape", () => {
		expect(
			resolveEscapeAction({
				paletteOpen: false,
				hasActiveTurn: true,
				turnCancelled: false,
			}),
		).toBe("cancel-turn");
	});

	test("ignores a second Escape while the cancelled turn is still unwinding", () => {
		expect(
			resolveEscapeAction({
				paletteOpen: false,
				hasActiveTurn: true,
				turnCancelled: true,
			}),
		).toBe("ignore");
	});

	test("ignores any further Escape presses while still cancelling (triple press)", () => {
		const input = {
			paletteOpen: false,
			hasActiveTurn: true,
			turnCancelled: true,
		};
		expect(resolveEscapeAction(input)).toBe("ignore");
		expect(resolveEscapeAction(input)).toBe("ignore");
	});

	test("never exits merely because cancellation was requested or finished", () => {
		// Regression test: an earlier implementation treated "cancelled" as
		// equivalent to "idle", so a fast double-Escape fell through to
		// exiting the whole app before (or right after) the stream had
		// actually unwound. Escape must never exit the app at all now.
		const stillUnwinding = resolveEscapeAction({
			paletteOpen: false,
			hasActiveTurn: true,
			turnCancelled: true,
		});
		const settledIdle = resolveEscapeAction({
			paletteOpen: false,
			hasActiveTurn: false,
			turnCancelled: true,
		});
		expect(stillUnwinding).not.toBe("exit");
		expect(settledIdle).not.toBe("exit");
	});

	test("is a no-op when idle: no palette open and no active turn", () => {
		expect(
			resolveEscapeAction({
				paletteOpen: false,
				hasActiveTurn: false,
				turnCancelled: false,
			}),
		).toBe("ignore");
	});

	test("a fresh Escape after a turn actually clears stays a no-op, never exits", () => {
		// hasActiveTurn: false models the state once consumeAssistantStream's
		// cleanup has run and cleared the turn reference. Escape must not
		// treat "idle after a recent cancel" as a reason to quit.
		expect(
			resolveEscapeAction({
				paletteOpen: false,
				hasActiveTurn: false,
				turnCancelled: true,
			}),
		).toBe("ignore");
	});
});
