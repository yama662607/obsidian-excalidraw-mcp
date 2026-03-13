# Gemini Agent Guidelines

## Project Overview

MCP server for safely editing .excalidraw.md files as visual knowledge objects in Obsidian.

## Tech Stack

- **Language**: TypeScript (ESM, Node.js >= 20)
- **Build**: tsup
- **Test**: Vitest
- **Format/Lint**: Biome
- **Type Check**: TypeScript

## Justfile Usage

This project uses `just` for task automation. Follow these commands:

### Required Commands
- `just check` — Run all read-only checks (format, lint, typecheck, tests)
- `just fix` — Apply auto-fixable formatting and lint issues

### Workflow
1. After editing: Run `just check`
2. If errors: Run `just fix`, then `just check` again
3. Only commit when `just check` passes

### All Commands
- `just setup` — Install dependencies, setup toolchain
- `just check` — Run all quality checks (CI gate)
- `just fix` — Apply auto-fixes
- `just test [args]` — Run tests (argument pass-through)
- `just test-watch` — Run tests in watch mode
- `just dev` — Start development server (watch mode)
- `just build` — Production build
- `just clean` — Remove build artifacts
- `just upgrade` — Upgrade dependencies

## Code Organization

- `src/core/` — Core business logic
  - `codec/` — Encoding/decoding Excalidraw data
  - `parser/` — Parsing .excalidraw.md files
  - `model/` — Data models and types
  - `services/` — Business services
  - `storage/` — File system operations
- `src/server/` — MCP server implementation
  - `tools/` — MCP tool handlers
