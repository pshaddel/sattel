# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`sattel` is an early-stage CLI scaffold for a Claude-style AI coding agent, built with Bun and TypeScript. It uses OpenRouter's agent SDK (`@openrouter/agent`) for the actual LLM call and tool-calling loop.

## Commands

- Package manager is Bun (`bun.lock` is present) — use `bun install` / `bun add`, not npm/yarn.
- Run the CLI: `bun src/index.ts`.
- `bun test` — unit tests; fast, offline, no network calls.
- `bun run test:integration` — live OpenRouter integration tests (needs `OPENROUTER_API_KEY`; makes real, billed calls).
- `bun run check` / `bun run format` — Biome lint+format check / auto-fix.
- `bun run build` — compiles a standalone binary to `dist/sattel` (`bun build --compile`), for testing the CLI against other project directories without `bun src/index.ts`. `~/.local/bin/sattel` is symlinked to it on this machine, so re-running `bun run build` picks up code changes without re-linking.
  - `css-tree` (a transitive dep of `@b9g/termdom`, used to parse the CSS in `src/ui/styles.ts`) loads its data files (`data/patch.json`, and `mdn-data`'s `at-rules`/`properties`/`syntaxes` JSON) via `createRequire(import.meta.url)`/plain `require(...)` at runtime. `bun build --compile`'s static analysis doesn't see through that to embed the files, so the compiled binary fails with `Cannot find module '...json' from '/$bunfs/root/sattel'`. Patched via `patches/css-tree@3.2.1.patch` (`bun patch`) to inline that JSON directly as JS literals in `lib/data.js`/`data-patch.js` and their `cjs/*` counterparts, so nothing is loaded from disk at runtime. The patch is registered in `package.json`'s `patchedDependencies` and reapplies automatically on `bun install`; if `css-tree` or `mdn-data` gets upgraded, re-check this (`bun build --compile` + run the binary is the fastest way to notice a regression here).
- No `tsconfig.json` is configured in the repo.

## Architecture

`src/index.ts` is the single CLI entrypoint: a custom TUI built on `@b9g/termdom` (not `@clack/prompts`). It wires up `readFileTool`/`writeFileTool`/`shellTool`, a slash-command palette (`/exit`, `/quit`, `/new`, `/reset`, `/init`), and a human-approval prompt flow for shell commands (see Tools below) — approval is a mode flag layered onto the same input textarea's keydown handler (no separate confirm widget exists). `/init` runs `runInitFlow()`: refuses to run if `CLAUDE.md` already exists, otherwise does a read-only exploration turn (`runInit`, using only `readFileTool`/`shellTool`) and writes the generated content to `CLAUDE.md`.

`src/llm/llm.ts` wraps the `OpenRouter` client:
- `testStreamingLLM` — the main per-turn model call.
- `resumeAfterApproval` — resumes a conversation paused in `awaiting_approval` status, passing `approveToolCalls`/`rejectToolCalls` (see Tools below).
- `runInit` — the read-only exploration call backing `/init` (its prompt is defined in this file).
- `testStreamingLLM` and `resumeAfterApproval` both inject the current `CLAUDE.md`/`AGENTS.md` content as the model's `instructions`, loaded via `src/context/projectInstructions.ts` and cached until `invalidateProjectInstructionsCache()` runs (called after `/init` writes a fresh file).

`src/tools/` — tool definitions built with the SDK's `tool()`:
- `file.ts` — `readFileTool` (line-numbered read, optional sections) and `writeFileTool` (find/replace-style edits).
- `shell.ts` — `shellTool`, one generic shell-execution tool: `{ command, args, cwd }`, no shell interpolation (`Bun.spawn` runs the binary directly — no pipes/redirects/`&&`). `ls`/`cat`/`grep`/`git` always run; any other command needs one-time human approval via the SDK's `requireApproval` gate, then is remembered in `.sattel/settings.json` keyed on `command + args[0]` (e.g. `"npm run"`, distinct from `"npm test"`).
- `path-guard.ts` — pure, lexical helpers (`resolveWithinRoot`/`isPathWithinRoot`) that check whether a path (absolute or relative) stays inside a root directory. `shellTool.execute` uses it to keep every path in `cwd`/`args` inside the project directory, enforced independently of the approval gate (so approving a command can't be used to escape the boundary). It does not follow symlinks.
- `tool-display.ts` / `file.helper.ts` — turn a tool call's name + arguments into a short human-readable line for the TUI log (e.g. `Run → npm run build`).

`src/settings/settings.ts` — project-local `.sattel/settings.json` store for remembered shell-command approvals. This is plain CLI code, not a tool exposed to the model — only the human-approval flow in `index.ts` writes to it.

`src/db/` — global SQLite storage (`bun:sqlite`) at `~/.sattel/sattel.db`, shared across every project sattel is run against (unlike `.sattel/settings.json` above, which stays project-local). `db.ts`'s `openDb()` creates the file/directory and applies any pending migrations before returning the handle; callers own it and must `.close()` it. `migrations/` holds one file per schema change (`NNN-description.ts`, each exporting a `{ id, sql }` literal, listed in order in `migrations/index.ts` and tracked by applied `id` in a `schema_migrations` table so each one runs exactly once). `file.db.ts` is the first table built on this — `mentioned_files` (`id`, `project`, `path`, `attempts`, `last_attempt_date`, UNIQUE on `(project, path)`) backs the `@`-mention palette's recently-used file list, scoped per project (identified by its absolute cwd) so one project's mentions never leak into or evict another's: `recordFileMention(path, project = cwd)` upserts a mention (incrementing `attempts`/refreshing `last_attempt_date` on a repeat, keyed on the `(project, path)` UNIQUE constraint) then prunes that project's rows with `last_attempt_date` older than 7 days and caps that project's rows at 200, oldest by `last_attempt_date` dropped first — so re-mentioning a file refreshes its recency and rescues it from eviction, giving true LRU behavior rather than insertion-order truncation; `getRecentFiles(limit?, project = cwd)` returns up to `limit` paths for that project ordered most-recent-first, applying the same 7-day cutoff independently at read time (so a stale row still sitting in the table between writes is excluded). Both functions swallow all storage errors (missing dir, locked file, corrupt DB) and fail to a no-op / empty array, since this is a nice-to-have for the mention palette, not something that should ever break the CLI. Wired into `index.ts`: a bare `@` with no query yet renders `getRecentFiles()` in the palette (falling back to the alphabetical project-files list when there's no mention history yet), and selecting a file via Tab or Enter calls `recordFileMention`.

`src/context/projectInstructions.ts` — loads/writes `CLAUDE.md` or `AGENTS.md` from the project root; `projectInstructionsFileExists()` backs `/init`'s no-overwrite check.

`src/ui/` — TUI helpers used by `index.ts`: `command-palette.ts` / `command-highlighter.ts` (slash-command autocomplete and matching), `spinner.ts`, `styles.ts`.

Tests mirror `src/`: `tests/**/*.test.ts` are unit tests (real execution against temp directories, no mocking — e.g. `tests/db/file.db.test.ts` redirects `HOME` to a temp dir per test so it runs against a real but isolated `bun:sqlite` file, since the DB is now global); `tests/**/*.integration.test.ts` make live model calls, gated behind `RUN_INTEGRATION_TESTS` + `OPENROUTER_API_KEY`, looping over the models listed in `tests/models.ts`.
