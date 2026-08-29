import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
	isShellCommandAllowed,
	loadSettings,
	recordAllowedShellCommand,
} from "../../src/settings/settings";

const TEMP_DIR = path.join(import.meta.dir, "temp");

beforeEach(async () => {
	await fs.promises.mkdir(TEMP_DIR, { recursive: true });
});

afterEach(async () => {
	await fs.promises.rm(TEMP_DIR, { recursive: true, force: true });
});

describe("loadSettings", () => {
	test("returns the default when .sattel/ doesn't exist yet", () => {
		expect(loadSettings(TEMP_DIR)).toEqual({
			version: 1,
			allowedShellCommands: [],
		});
	});

	test("returns the default when the file contains invalid JSON", async () => {
		await fs.promises.mkdir(path.join(TEMP_DIR, ".sattel"), {
			recursive: true,
		});
		await fs.promises.writeFile(
			path.join(TEMP_DIR, ".sattel", "settings.json"),
			"{ not valid json",
			"utf8",
		);

		expect(loadSettings(TEMP_DIR)).toEqual({
			version: 1,
			allowedShellCommands: [],
		});
	});

	test("returns the default when the JSON fails schema validation", async () => {
		await fs.promises.mkdir(path.join(TEMP_DIR, ".sattel"), {
			recursive: true,
		});
		await fs.promises.writeFile(
			path.join(TEMP_DIR, ".sattel", "settings.json"),
			JSON.stringify({ version: 1, allowedShellCommands: "not-an-array" }),
			"utf8",
		);

		expect(loadSettings(TEMP_DIR)).toEqual({
			version: 1,
			allowedShellCommands: [],
		});
	});
});

describe("recordAllowedShellCommand / isShellCommandAllowed", () => {
	test("creates .sattel/settings.json on first call", () => {
		expect(isShellCommandAllowed("npm run", TEMP_DIR)).toBe(false);

		recordAllowedShellCommand("npm run", TEMP_DIR);

		expect(fs.existsSync(path.join(TEMP_DIR, ".sattel", "settings.json"))).toBe(
			true,
		);
		expect(isShellCommandAllowed("npm run", TEMP_DIR)).toBe(true);
	});

	test("does not duplicate an entry when recorded twice", () => {
		recordAllowedShellCommand("npm run", TEMP_DIR);
		recordAllowedShellCommand("npm run", TEMP_DIR);

		expect(loadSettings(TEMP_DIR).allowedShellCommands).toEqual(["npm run"]);
	});

	test("tracks distinct keys independently", () => {
		recordAllowedShellCommand("npm run", TEMP_DIR);

		expect(isShellCommandAllowed("npm run", TEMP_DIR)).toBe(true);
		expect(isShellCommandAllowed("npm test", TEMP_DIR)).toBe(false);
	});
});
