const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Renders an ISO timestamp as a short relative label for the `/resume`
 * session picker (e.g. "5m ago", "3d ago"), falling back to a plain date
 * once it's old enough that a relative label stops being useful. `now` is
 * an injectable param so this stays deterministically testable.
 */
export function relativeDate(iso: string, now: number = Date.now()): string {
	const then = new Date(iso).getTime();
	const diffMs = now - then;

	if (Number.isNaN(then) || diffMs < 0) {
		return new Date(iso).toLocaleDateString();
	}
	if (diffMs < MINUTE_MS) {
		return "just now";
	}
	if (diffMs < HOUR_MS) {
		return `${Math.floor(diffMs / MINUTE_MS)}m ago`;
	}
	if (diffMs < DAY_MS) {
		return `${Math.floor(diffMs / HOUR_MS)}h ago`;
	}
	if (diffMs < 7 * DAY_MS) {
		return `${Math.floor(diffMs / DAY_MS)}d ago`;
	}
	return new Date(iso).toLocaleDateString();
}
