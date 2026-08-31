import { describe, expect, test } from "bun:test";
import { relativeDate } from "../../src/ui/relative-date";

const NOW = new Date("2026-08-30T12:00:00.000Z").getTime();

describe("relativeDate", () => {
	test("labels a timestamp under a minute old as 'just now'", () => {
		const iso = new Date(NOW - 30_000).toISOString();
		expect(relativeDate(iso, NOW)).toBe("just now");
	});

	test("labels a timestamp minutes old as 'Nm ago'", () => {
		const iso = new Date(NOW - 5 * 60_000).toISOString();
		expect(relativeDate(iso, NOW)).toBe("5m ago");
	});

	test("labels a timestamp hours old as 'Nh ago'", () => {
		const iso = new Date(NOW - 3 * 60 * 60_000).toISOString();
		expect(relativeDate(iso, NOW)).toBe("3h ago");
	});

	test("labels a timestamp days old (under a week) as 'Nd ago'", () => {
		const iso = new Date(NOW - 2 * 24 * 60 * 60_000).toISOString();
		expect(relativeDate(iso, NOW)).toBe("2d ago");
	});

	test("falls back to a plain date once a week or older", () => {
		const iso = new Date(NOW - 10 * 24 * 60 * 60_000).toISOString();
		expect(relativeDate(iso, NOW)).toBe(new Date(iso).toLocaleDateString());
	});
});
