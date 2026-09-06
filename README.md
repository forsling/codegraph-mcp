# codegraph-mcp

Graph-native code intelligence for coding agents.

This project tests a simple hypothesis: an agent should navigate a repository through a compact, deterministic program graph and retrieve full source only for symbols it decides are relevant.

The MVP indexes TypeScript into a function/symbol-level SQLite graph and exposes structural queries over MCP.

## Current MVP

- TypeScript Compiler API indexing
- stable symbol IDs
- function/method call edges
- symbol read/write/reference edges
- SQLite graph store
- compact MCP queries
- lazy source retrieval by symbol

## Try it

```bash
npm install
npm run build
node dist/cli.js index /path/to/typescript/project
node dist/cli.js serve /path/to/typescript/project
```

The server uses stdio transport, so an MCP host should launch the `serve` command and communicate over stdin/stdout.

The index database defaults to `<project>/.codegraph.sqlite`. Pass a third argument to `index` and `serve` to use another path.

## MCP tools

`search_symbols`, `get_symbol`, `get_neighbors`, `get_callers`, `get_callees`, `get_references`, and `get_source`.

See `docs/DESIGN.md` for the experiment and `docs/MCP.md` for the tool contract.

## Status

Early MVP foundation. Direct-edge correctness, path traversal, stale-index detection, fixtures, and the evaluation harness are next.
