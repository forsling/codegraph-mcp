# MCP tool contract

The MCP API is deliberately small and symbol-ID centric.

| Tool | Purpose |
|---|---|
| `search_symbols` | Resolve names to stable symbols without source retrieval |
| `get_symbol` | Return compact symbol metadata |
| `get_neighbors` | Query direct typed relationships |
| `get_callers` | Query incoming call edges |
| `get_callees` | Query outgoing call edges |
| `get_references` | Query reads/writes/references |
| `get_source` | Lazily retrieve a selected implementation or signature |

`find_paths` is the next planned primitive once direct-edge correctness is covered by tests.

Graph results should stay dense and machine-oriented. They must report truncation instead of silently dropping excess results. Relationships should carry provenance and certainty so later static-analysis approximations can coexist with exact compiler-derived edges.
