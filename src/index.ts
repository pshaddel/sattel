import { intro, multiline, note, outro, spinner, SpinnerResult } from "@clack/prompts";
import picocolors from "picocolors";
import { testStreamingLLM } from "./llm/llm";
import { readFileTool, writeFileTool } from "./tools/file";

async function main() {
	// 1. Welcome the user
	intro(picocolors.bgCyan(picocolors.black("Sattel Coding Agent")));
	// while (!shouldExit) {
	// 2. Get user intent
	const userPrompt = await multiline({
		message: "What project task can I help you with today?",
		placeholder: "e.g., refactor auth.ts to use JWT tokens",
	});

	if (typeof userPrompt === "symbol") {
		outro("Operation cancelled.");
		return;
	}

	if (userPrompt.includes("/exit") || userPrompt.includes("/quit")) {
		process.exit(0);
	}

	const result = testStreamingLLM(userPrompt, [readFileTool, writeFileTool]);

	// 	// 4. Output structured markdown-like summary
	// note(
	// 	`1. Located auth.ts\n2. Replaced session storage with JWT signing\n3. Updated middleware.ts`,
	// 	"Action Plan Executed",
	//   );

	const s = spinner();
	// s.start("Analyzing codebase and thinking...");
	/**
	 * keeps list of tool calls, if they are completed we set that one to true.
	 */
	const toolCallsMap = new Map<string, SpinnerResult>();
	for await (const item of result.getItemsStream()) {
		switch (item.type) {
			case "message":
				if (item.status === "completed") {
					note(
						item.content ? (item.content[0] ? (item.content[0] as { text: string }).text : "") : "",
					);
				}
				break;
			case "function_call":
				// only first time that it is in progress.
				if (
					item.status === "in_progress" &&
					!toolCallsMap.has(item.callId || "")
        ) {
          const spin = spinner();
					toolCallsMap.set(item.callId || "", spin);
					spin.start(
						`${item.name} is being called with arguments ${item.arguments}`,
					);
					// note(`Tool call: ${item.name} with arguments ${item.arguments}`);
					break;
				}
        if (item.status === "completed") {
					const spin = toolCallsMap.get(item.callId || "");
          if (spin) {
            spin.stop(`${item.name} args: ${item.arguments} completedç!`);
          }
					// note(
					//   `Tool call completed: ${item.name} with arguments ${item.arguments}`,
					// );
					s.stop(`${item.name} completed successfully!`);
					break;
				}
				break;
			case "reasoning":
				// console.log('Thinking:', item.summary);
				break;
			case "function_call_output":
				// console.log('Tool result:', item.output);
				break;
		}
	}
	// s.stop("Analysis complete!");
	// }

	// 5. Clean exit
	outro(picocolors.green("✔ Done! Your code has been updated successfully."));
}

main();
