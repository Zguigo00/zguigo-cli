# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run the CLI (from project root only)
npx tsx src/index.ts

# Run with debug logging
npx tsx src/index.ts --debug

# Build for production
npm run build

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run a single test file
npx vitest run tests/tools/read-files.test.ts
```

## Architecture

**zguigo** is a terminal AI coding assistant that connects to Xiaomi's MiMo model via an OpenAI-compatible API.

### Core Loop (Agent Loop)

The entry point is `runAgent()` in `src/agent/loop.ts`. It implements a streaming agent loop:

1. User message → stream model response via `ModelClient.chatStream()`
2. If model returns `tool_calls` → execute via `ToolRegistry.call()` → write results back to messages → loop
3. If model returns pure text → output and stop
4. Max 8 iterations per run

The REPL (`src/cli/repl.ts`) wraps this loop, providing readline with `/help`, `/clear`, `/exit` commands.

### Model Client

`src/model/client.ts` wraps the OpenAI SDK with custom `baseURL` for Xiaomi MiMo. Config is loaded from `.env` via `src/model/config.ts`. Two methods: `chat()` (non-stream) and `chatStream()` (async generator yielding `StreamEvent`).

### Tools

Tools follow the protocol in `src/tools/protocol.ts`: each tool has `name`, `description`, `parameters` (JSON Schema), and `execute()` returning `{ success, data?, error? }`. Currently read-only tools only: `list_files` and `read_file`.

Path safety is enforced by `src/workspace/safety.ts` — all paths must resolve within the workspace root. Directory filtering (`.git`, `node_modules`, etc.) is in `src/workspace/filter.ts`.

### Key Constraints

- **Run from project root**: The CLI must be executed from the `zguigo_Cli` directory, not from `src/`
- **Chinese comments**: All code comments are in Chinese
- **ESM only**: `"type": "module"` with `.js` extensions in imports
- **No write tools yet**: Phase 5 (read/write + permission control) is not implemented
