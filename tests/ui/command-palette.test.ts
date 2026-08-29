import { describe, expect, test } from "bun:test";
import { TermDOM } from "@b9g/termdom";
import {
	type CommandDef,
	renderCommandPalette,
} from "../../src/ui/command-palette";

function makeContainer() {
	const term = new TermDOM();
	const { document } = term;
	const container = document.createElement("div");
	document.body.appendChild(container);
	return container;
}

describe("renderCommandPalette", () => {
	const commands: CommandDef[] = [
		{ name: "/exit", description: "Exit the session" },
		{
			name: "/init",
			description: "Explore the project and generate CLAUDE.md",
		},
	];

	test("renders one row per command", () => {
		const container = makeContainer();
		renderCommandPalette(container, commands, 0);
		expect(container.children.length).toBe(2);
	});

	test("renders each row's name and description text", () => {
		const container = makeContainer();
		renderCommandPalette(container, commands, 0);
		const rows = Array.from(container.children);
		expect(rows[0].querySelector(".palette-name")?.textContent).toBe("/exit");
		expect(rows[0].querySelector(".palette-description")?.textContent).toBe(
			"Exit the session",
		);
		expect(rows[1].querySelector(".palette-name")?.textContent).toBe("/init");
	});

	test("marks only the selected index as selected", () => {
		const container = makeContainer();
		renderCommandPalette(container, commands, 1);
		const rows = Array.from(container.children);
		expect(rows[0].className).toBe("palette-item");
		expect(rows[1].className).toBe("palette-item selected");
	});

	test("clears previously rendered rows on re-render", () => {
		const container = makeContainer();
		renderCommandPalette(container, commands, 0);
		renderCommandPalette(container, [commands[0]], 0);
		expect(container.children.length).toBe(1);
	});

	test("renders nothing for an empty command list", () => {
		const container = makeContainer();
		renderCommandPalette(container, commands, 0);
		renderCommandPalette(container, [], 0);
		expect(container.children.length).toBe(0);
	});

	test("renders file-mention-shaped entries (empty description) the same way", () => {
		const container = makeContainer();
		const fileEntries: CommandDef[] = [
			{ name: "src/ui/file-mention.ts", description: "" },
		];
		renderCommandPalette(container, fileEntries, 0);
		const row = container.children[0];
		expect(row.querySelector(".palette-name")?.textContent).toBe(
			"src/ui/file-mention.ts",
		);
		expect(row.querySelector(".palette-description")?.textContent).toBe("");
	});
});
