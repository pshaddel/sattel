/**
 * A conversation's stored `messages` array is a large discriminated union
 * (see @openrouter/agent's `InputsUnion`): user-authored items
 * (`InputMessageItem`/`EasyInputMessage`) and assistant output items
 * (`InputsMessage`/`AgentMessageItem`) are genuinely different shapes, not
 * one type discriminated by `role` alone — both are handled generically
 * here by duck-typing `role` and `content` rather than assuming either
 * shape. Used both for `/resume`'s transcript replay and for reseeding
 * `commandHistory` (filtered to `role === "user"`) from a resumed session.
 */
export interface ReplayItem {
	role: "user" | "assistant";
	text: string;
}

function extractText(content: unknown): string {
	if (typeof content === "string") {
		return content;
	}
	if (Array.isArray(content)) {
		return content
			.map((part) =>
				typeof part === "object" &&
				part !== null &&
				"text" in part &&
				typeof (part as { text: unknown }).text === "string"
					? (part as { text: string }).text
					: "",
			)
			.join("");
	}
	return "";
}

export function extractReplayItems(messages: unknown): ReplayItem[] {
	if (!Array.isArray(messages)) {
		return [];
	}

	const items: ReplayItem[] = [];
	for (const item of messages) {
		if (typeof item !== "object" || item === null || !("role" in item)) {
			continue;
		}
		const role = (item as { role: unknown }).role;
		if (role !== "user" && role !== "assistant") {
			continue;
		}
		const text = extractText((item as { content?: unknown }).content);
		if (text === "") {
			continue;
		}
		items.push({ role, text });
	}
	return items;
}
