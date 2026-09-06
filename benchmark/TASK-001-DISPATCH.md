# Task 001 — Remote Agent A/B Dispatch

## Purpose

Measure whether `codegraph-mcp` reduces repository-navigation/source retrieval cost for a real maintenance task compared with ordinary filesystem/search tools.

Run the same coding agent/model twice from the same frozen base branch, with no shared conversation or state between runs.

Frozen base branch:

```text
benchmark/task-001-base
```

Do not start either condition from `main`.

## The coding task

Fix property-write classification in the TypeScript indexer.

The current access classifier correctly recognizes writes when the indexed identifier itself is the left-hand side of an assignment, for example:

```ts
currentTenant = tenant;
```

It does not correctly classify a property symbol when the property is written through a property access, for example:

```ts
state.currentTenant = tenant;
state.currentTenant++;
```

After the fix, the program graph must emit `WRITES` edges from the owning function/method to the property/field symbol for direct property assignments and `++`/`--` mutations. Reads must continue to be classified correctly.

Keep the change narrowly scoped. Do not redesign the graph model or add dataflow analysis.

## Required implementation outcome

The agent should:

1. Fix the TypeScript indexer's access classification for direct property writes.
2. Add or extend a fixture that contains both property reads and property writes.
3. Add assertions through the public MCP interface showing that `get_references(..., access="write")` returns the writer and that read queries still behave correctly.
4. Keep existing tests green.
5. Run:

```bash
npm ci
npm run check
npm run build
```

and the repository's smoke/dogfood tests.

Do not accept a solution that only changes tests or special-cases fixture symbol names.

## Condition A — filesystem baseline

Start from a fresh checkout/worktree at `benchmark/task-001-base`.

Give the agent its normal repository tools: file listing, grep/search, file reads, editing, shell/tests, etc.

Do **not** expose the codegraph MCP server or tell the agent where the bug is implemented beyond the task statement above.

Use this prompt verbatim:

```text
Fix Task 001 in this repository: property writes such as `state.currentTenant = tenant` and `state.currentTenant++` must be represented as WRITES edges to the property/field symbol, while reads remain correct. Add coverage through the public MCP interface, keep the change narrowly scoped, and run the relevant checks/tests. Commit your solution when done.
```

Record, if the host exposes them:

- model/version
- wall-clock duration
- total input/output tokens
- tool calls
- files read
- source bytes/tokens returned by filesystem read tools
- first point at which the agent opened the implementation it ultimately changed
- final commit SHA

If exact filesystem-read token accounting is unavailable, preserve the full tool transcript so we can derive/estimate it later.

## Condition B — codegraph primary navigation

Start from another fresh checkout/worktree at the **same** `benchmark/task-001-base` commit.

Prepare the repo:

```bash
npm ci
npm run build
node dist/cli.js index . .benchmark-codegraph.sqlite
```

Expose this MCP server to the coding agent:

```bash
CODEGRAPH_METRICS_FILE=.benchmark-mcp-metrics.jsonl \
node dist/cli.js serve . .benchmark-codegraph.sqlite
```

The exact MCP-host configuration syntax is host-specific; the server transport is stdio.

The agent may use normal shell/edit/test commands, but for **repository navigation and source discovery**, instruct it to use codegraph MCP first. It should retrieve source with `get_source` after graph navigation identifies relevant symbols. Ordinary grep/file reads are allowed only as fallback when the graph interface is insufficient; do not prohibit them because fallback behavior is itself useful evidence.

Use this prompt verbatim:

```text
Fix Task 001 in this repository: property writes such as `state.currentTenant = tenant` and `state.currentTenant++` must be represented as WRITES edges to the property/field symbol, while reads remain correct. Add coverage through the public MCP interface, keep the change narrowly scoped, and run the relevant checks/tests.

Use the codegraph MCP tools as your primary mechanism for understanding and navigating the codebase. Retrieve implementation source lazily with `get_source` after locating relevant symbols. You may fall back to ordinary repository search/read tools if the graph cannot answer something you need; if you do, continue normally rather than forcing the graph. Commit your solution when done.
```

Preserve `.benchmark-mcp-metrics.jsonl` after the run.

Also record:

- model/version
- wall-clock duration
- total input/output tokens if exposed by the host
- fallback filesystem/search calls
- final commit SHA
- full agent/tool transcript if available

## Important experimental controls

- Use the same model/version and comparable reasoning settings for A and B.
- Run each condition in a fresh session with no knowledge of the other run.
- Use the same base commit.
- Do not manually point either agent to `src/indexer.ts` or `classifyAccess`.
- Do not reveal the expected patch.
- Do not intervene unless the agent is blocked by infrastructure unrelated to the task.
- If an infrastructure intervention is necessary, record it.

Ideally run A first or randomize order. Do not let the B agent see A's patch or transcript.

## Success criteria

A run is successful only if all of these hold:

- TypeScript check/build succeeds.
- Existing MCP smoke/self-dogfood tests remain green.
- New public-MCP coverage demonstrates property writes are returned by `get_references(..., access="write")`.
- Property reads remain queryable as reads.
- The implementation is general for direct property accesses, not tied to the fixture.

## What we want back

For each condition, return:

```text
condition: A | B
model: ...
base_commit: ...
result_commit: ...
success: true | false
wall_clock_seconds: ...
total_agent_tokens: ... | unavailable
filesystem_source_bytes: ... | unavailable
graph_response_bytes: 0 for A; value from metrics for B
source_response_bytes: 0 for A; value from metrics for B
fallback_filesystem_calls: ...
tool_calls: ... | unavailable
notes: ...
```

For Condition B, also attach/paste:

```text
.benchmark-mcp-metrics.jsonl
```

and, if practical, run:

```bash
node benchmark/summarize-metrics.mjs .benchmark-mcp-metrics.jsonl
```

Return the agent transcript/tool log for both conditions if the remote-agent system makes it available.

## Primary comparison

The most important comparison is not total model tokens by itself. We want to know:

1. Did both agents solve the task correctly?
2. How much repository/source material did each consume before locating the relevant implementation?
3. How many graph-navigation tokens replaced source-reading tokens in Condition B?
4. Did Condition B fall back to ordinary search/read tools, and why?
5. Did the graph cause extra wandering or did it compress navigation?

A strong positive result would be comparable task success with materially less source retrieval in Condition B. A negative result is equally useful if it shows the graph adds overhead, misses a necessary relationship, or fails to guide the agent toward the relevant symbol.
