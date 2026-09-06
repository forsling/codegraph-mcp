# codegraph-mcp

Graph-native code intelligence for coding agents.

This project tests a simple hypothesis: an agent should navigate a repository through a compact, deterministic program graph and retrieve full source only for symbols it decides are relevant.

The MVP indexes TypeScript into a function/symbol-level SQLite graph and exposes structural queries over MCP.

## Status

Early MVP. The first target is TypeScript with exact compiler-derived symbol, call, reference, read, and write relationships.
