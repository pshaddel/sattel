/**
 * Pure decision logic for ArrowUp/ArrowDown history recall, kept separate
 * from `index.ts`'s DOM wiring so the recall/restore semantics are
 * unit-testable without a live TermDOM instance.
 *
 * Recall only ever engages from an empty input box (nothing to lose), or
 * while already navigating. Once a recalled entry is edited, the caller
 * resets `index` back to -1 (see index.ts's "input" listener), so a further
 * ArrowUp on the now non-empty, non-navigating box is correctly refused
 * here rather than silently overwriting the edit.
 */
export interface HistoryNavState {
	history: string[];
	/** -1 = not currently navigating. */
	index: number;
}

export type HistoryNavResult =
	| { handled: false }
	| { handled: true; index: number; value: string };

export function resolveHistoryNav(
	key: "ArrowUp" | "ArrowDown",
	value: string,
	state: HistoryNavState,
): HistoryNavResult {
	const navigating = state.index !== -1;

	if (key === "ArrowUp") {
		if (!navigating && (value !== "" || state.history.length === 0)) {
			return { handled: false };
		}
		const index = navigating
			? Math.max(0, state.index - 1)
			: state.history.length - 1;
		return { handled: true, index, value: state.history[index] ?? "" };
	}

	// ArrowDown
	if (!navigating) {
		return { handled: false };
	}
	const index = state.index + 1;
	if (index >= state.history.length) {
		return { handled: true, index: -1, value: "" };
	}
	return { handled: true, index, value: state.history[index] ?? "" };
}
