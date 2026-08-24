export function toolVerb(name: string): string {
	switch (name) {
		case "readFile":
			return "Read";
		case "writeFile":
			return "Write";
		default:
			return name;
	}
}

export function extractPath(argumentsJson: string): string | null {
	try {
		const parsed = JSON.parse(argumentsJson);
		return typeof parsed?.path === "string" ? parsed.path : null;
	} catch {
		return null;
	}
}

export function shortenPath(path: string, keepSegments = 2): string {
	const parts = path.split("/").filter(Boolean);
	if (parts.length <= keepSegments) return path;
	return `.../${parts.slice(-keepSegments).join("/")}`;
}
