import { shortenPath } from "./file.helper";

export function describeToolCall(name: string, args: unknown): string {
	if (name === "readFile" || name === "writeFile") {
		const path = (args as { path?: unknown })?.path;
		if (typeof path === "string") {
			return shortenPath(path);
		}
	}
	if (name === "shell") {
		const { command, args: cmdArgs } =
			(args as { command?: string; args?: string[] }) ?? {};
		if (typeof command === "string") {
			return [command, ...(cmdArgs ?? [])].join(" ");
		}
	}
	return typeof args === "string" ? args : JSON.stringify(args);
}

export function describeToolCallJson(
	name: string,
	argumentsJson: string,
): string {
	try {
		return describeToolCall(name, JSON.parse(argumentsJson));
	} catch {
		return argumentsJson;
	}
}
