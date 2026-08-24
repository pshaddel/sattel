import { OpenRouter, type StateAccessor, type Tool } from "@openrouter/agent";
import { modelsGet } from "@openrouter/sdk/funcs/modelsGet";

export const openrouter = new OpenRouter({
	apiKey: process.env.OPENROUTER_API_KEY,
});

export async function getModelContextLength(
	model: string,
): Promise<number | null> {
	const [author, slug] = model.split(/\/(.*)/s);
	if (!author || !slug) {
		return null;
	}

	const result = await modelsGet(openrouter, { author, slug });
	if (!result.ok) {
		return null;
	}

	return result.value.data.contextLength;
}

export async function testLLMAccess(): Promise<void> {
	if (!process.env.OPENROUTER_API_KEY) {
		console.error(
			"Error: OPENROUTER_API_KEY is not set in the environment variables.",
		);
		return;
	}

	const result = openrouter.callModel({
		model: "openai/gpt-5-nano",
		input: "this is a test, just answer with 'ok'",
	});

	const res = await result.getText();
	if (!res) {
		console.error("Error: No response from the model.");
		process.exit(1);
	}
}

export function testStreamingLLM(
	userPrompt?: string,
	tools: Tool[] = [],
	state?: StateAccessor,
) {
	return openrouter.callModel({
		model: "openai/gpt-5-nano",
		// model: "google/gemini-3.7-flash",
		tools: tools,
		input:
			userPrompt ||
			"write a short sample javascript code snippet, which is a Express App Server",
		state,
	});
}
