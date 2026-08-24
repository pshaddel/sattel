import { getModelContextLength, openrouter } from "../src/llm/llm";
import { models } from "./models";

async function main() {
	if (!process.env.OPENROUTER_API_KEY) {
		console.error(
			"Error: OPENROUTER_API_KEY is not set in the environment variables.",
		);
		return;
	}

	for (const model of models) {
		try {
			const contextLength = await getModelContextLength(model);

			const result = openrouter.callModel({
				model,
				input: "Reply with a single word: ok",
			});
			const response = await result.getResponse();
			const usage = response.usage;

			const totalTokens = usage?.totalTokens ?? null;
			const percentOccupied =
				contextLength && totalTokens
					? `${((totalTokens / contextLength) * 100).toFixed(4)}%`
					: "n/a";

			console.log(
				`${model} — contextLength: ${contextLength ?? "unknown"}, ` +
					`inputTokens: ${usage?.inputTokens ?? "n/a"}, ` +
					`outputTokens: ${usage?.outputTokens ?? "n/a"}, ` +
					`totalTokens: ${totalTokens ?? "n/a"}, ` +
					`occupied: ${percentOccupied}`,
			);
		} catch (error) {
			console.error(
				`${model} — error: ${error instanceof Error ? error.message : error}`,
			);
		}
	}
}

main();
