# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`sattel` is an early-stage CLI scaffold for a Claude-style AI coding agent, built with Bun and TypeScript.

## Commands

- Package manager is Bun (`bun.lock` is present) — use `bun install` / `bun add`, not npm/yarn.
- Run the CLI: `bun src/index.ts`
- No `scripts` are defined in `package.json` yet, and there is no test runner, linter, or `tsconfig.json` configured in the repo.

## Architecture

- `src/index.ts` is the CLI entry point. It uses `@clack/prompts` for the interactive terminal UI (intro/outro, text prompt, spinner, note) and `picocolors` for terminal styling. Currently the "analysis" step is a hardcoded simulation (a timed `setTimeout`) rather than a real LLM call.
- `src/llm/llm.ts` is an empty stub — this is where the actual LLM integration is intended to live, replacing the simulated delay in `index.ts`.
