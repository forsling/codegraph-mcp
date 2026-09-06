# Agent A/B dogfood benchmark

This benchmark tests the project thesis directly: does graph-first repository navigation reduce source ingestion without hurting task success?

## Conditions

### A — filesystem baseline

The agent gets conventional repository navigation tools: file listing, text/code search, file/range reads, editing, and test execution. It does not get `codegraph-mcp`.

### B — graph-first

The agent gets `codegraph-mcp` as its primary repository navigation interface plus editing/test execution. Full source should be retrieved through `get_source` after structural navigation. Ordinary repository reads should be disabled when the host permits it; otherwise they must be logged separately.

Both conditions must use the same model, task prompt, starting commit, time/tool-call budget, and success tests.

## Primary metrics

1. Task success.
2. Source tokens retrieved before the first correct edit.
3. Total source tokens retrieved.
4. Graph/navigation tokens retrieved.
5. Total retrieval tokens.
6. Tool calls before reaching the relevant symbol(s).
7. Number of distinct source symbols/files opened.

For MCP condition B, set `CODEGRAPH_METRICS_FILE` when launching the server. The server writes one JSONL event per tool response with tool, category (`graph` or `source`), response bytes, and an approximate token count.

## First frozen task

See `tasks/001-property-write-classification.md`.

The task is intentionally a real correctness gap rather than a synthetic search exercise. The current indexer only recognizes direct identifier assignments as writes; property access writes such as `state.currentTenant = value` are not classified as `WRITES`. Fixing this requires understanding the access-classification logic and validating graph behavior.

## Run record

Each run should save:

- starting commit SHA;
- condition (`filesystem` or `graph`);
- model/version;
- task prompt;
- complete tool trajectory if available;
- retrieval metrics;
- final diff;
- test results;
- success/failure judgment.

Do not tune the task after observing one condition. If the task definition changes, create a new task ID.
