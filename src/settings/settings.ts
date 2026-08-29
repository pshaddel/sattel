import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const SettingsSchema = z.object({
	version: z.literal(1),
	allowedShellCommands: z.array(z.string()),
});

type Settings = z.infer<typeof SettingsSchema>;

function defaultSettings(): Settings {
	// A fresh object every call — never share one mutable instance, since
	// recordAllowedShellCommand pushes into the array it's handed.
	return { version: 1, allowedShellCommands: [] };
}

function settingsPath(cwd: string): string {
	return path.join(cwd, ".sattel", "settings.json");
}

export function loadSettings(cwd = process.cwd()): Settings {
	try {
		const raw = fs.readFileSync(settingsPath(cwd), "utf8");
		const parsed = SettingsSchema.safeParse(JSON.parse(raw));
		return parsed.success ? parsed.data : defaultSettings();
	} catch {
		// Missing file/dir, corrupt JSON, or a permissions error all fail open
		// to "nothing pre-approved" rather than crashing the CLI.
		return defaultSettings();
	}
}

export function isShellCommandAllowed(
	key: string,
	cwd = process.cwd(),
): boolean {
	return loadSettings(cwd).allowedShellCommands.includes(key);
}

export function recordAllowedShellCommand(
	key: string,
	cwd = process.cwd(),
): void {
	const settings = loadSettings(cwd);
	if (settings.allowedShellCommands.includes(key)) {
		return;
	}
	settings.allowedShellCommands.push(key);
	settings.allowedShellCommands.sort();
	fs.mkdirSync(path.dirname(settingsPath(cwd)), { recursive: true });
	fs.writeFileSync(
		settingsPath(cwd),
		`${JSON.stringify(settings, null, "\t")}\n`,
		"utf8",
	);
}
