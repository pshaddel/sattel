/**
 * Pure decision logic for the `Escape` key, kept separate from `index.ts`'s
 * DOM wiring so the precedence rules (and the double/triple-press race) are
 * unit-testable without a live TermDOM instance.
 *
 * Escape never exits Sattel — it only closes the palette or cancels an
 * in-progress turn. Quitting is always a separate, deliberate action
 * (Ctrl+C or `/exit`/`/quit`), so a fast repeated Escape can never
 * accidentally kill the session.
 */
export type EscapeAction = "close-palette" | "cancel-turn" | "ignore";

export function resolveEscapeAction(input: {
	paletteOpen: boolean;
	hasActiveTurn: boolean;
	turnCancelled: boolean;
}): EscapeAction {
	if (input.paletteOpen) {
		return "close-palette";
	}
	if (input.hasActiveTurn && !input.turnCancelled) {
		return "cancel-turn";
	}
	// Either idle, or a turn is still unwinding after a previous cancel —
	// both are a no-op for Escape.
	return "ignore";
}
