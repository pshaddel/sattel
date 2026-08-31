import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { generateSessionTitle } from "../../src/llm/llm";
import { models } from "../models";

// Makes real, billed calls to OpenRouter. Only runs when both
// RUN_INTEGRATION_TESTS and OPENROUTER_API_KEY are set (see
// `bun run test:integration`), so a plain `bun test` stays fast and free.
const canRun = Boolean(
	process.env.RUN_INTEGRATION_TESTS && process.env.OPENROUTER_API_KEY,
);

setDefaultTimeout(30_000);

describe.skipIf(!canRun)("live OpenRouter session title generation", () => {
	for (const model of models) {
		describe(model, () => {
			test("generates a short, non-empty title for a sample exchange", async () => {
				const title = await generateSessionTitle(
					"Can you refactor auth.ts to use JWT tokens instead of session cookies?",
					"Done — auth.ts now issues and verifies JWTs, and the session-cookie middleware has been removed.",
					model,
				);

				expect(title).toBeDefined();
				expect(title?.length).toBeGreaterThan(0);
				expect(title?.length).toBeLessThanOrEqual(80);
				expect(title).not.toContain('"');
			});
		});
	}
});
