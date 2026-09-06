# Codegraph MCP V2 Specification

## Status

Proposed V2 design, informed by the Task 001 A/B dogfood experiment.

V2 is not a new graph model or query language. It is an interface revision aimed at reducing the number of agent inference turns required to locate relevant code.

## 1. Motivation

Task 001 produced a useful negative result for V1.

Both filesystem-first and graph-first agents solved the task. The graph-first condition reduced estimated source-like retrieval before the first edit by about 24%, but increased total retrieval before the first edit by about 49%, total agent tokens by about 42%, tool calls by about 65%, and wall time by about 15%.

The detailed trajectory showed that the graph itself was not the principal failure. The agent made 22 attempted `search_symbols` calls: 21 returned normally, 10 of those were empty, and one failed schema validation. It repeatedly guessed symbol names and concepts even after it had found useful structural anchors. It also lacked a direct way to discover files or inspect the symbols contained in a known file.

The central V2 lesson is therefore:

> The optimization target is not merely fewer source bytes. It is fewer agent decision points between a task and the relevant implementation.

A small graph response is not cheap if obtaining it requires another model inference turn. V2 should collapse common exploration sequences into a few high-information operations.

## 2. Revised product thesis

V1 implicitly treated the program graph as a replacement navigation surface for filesystem tools.

V2 treats the server as a **repository intelligence interface** with three complementary retrieval modes:

```text
                 Repository Intelligence
                         |
          +--------------+--------------+
          |              |              |
      structural       textual        source
        graph           search       retrieval
          |              |              |
          +--------------+--------------+
                         |
                       Agent
```

The structural graph remains the distinctive substrate, but the agent should not need to leave the interface merely because the artifact it needs is a filename, JavaScript test, Markdown document, JSON configuration file, or unindexed text.

The graph is authoritative for deterministic program relationships. Text search is a complementary discovery mechanism, not graph truth.

## 3. Design goals

V2 should:

1. reduce exploratory MCP round trips;
2. make known-file and known-symbol navigation direct;
3. distinguish symbol discovery from repository/file discovery;
4. encourage structural traversal once a useful symbol anchor has been found;
5. allow source retrieval immediately when the agent has a plausible target;
6. provide graceful textual fallback for artifacts outside the semantic index;
7. preserve compact deterministic graph results;
8. preserve the typed request -> `GraphStore` -> handwritten SQL architecture;
9. remain measurable with server-side graph/source telemetry;
10. avoid adding an LLM or probabilistic query planner inside the server.

## 4. Non-goals

V2 does not introduce:

- a general graph query language;
- embeddings or semantic vector search;
- LLM-generated code summaries;
- full dataflow or taint analysis;
- runtime traces;
- Python support;
- a visual IDE;
- automatic natural-language query planning inside the MCP server.

Those remain possible later additions if dogfooding creates evidence for them.

## 5. V2 tool surface

### 5.1 `find_files`

Find repository files by path/name without pretending filenames are symbols.

Request:

```json
{
  "query": "server",
  "extensions": ["ts", "mjs"],
  "limit": 20
}
```

Response:

```json
{
  "files": [
    {
      "path": "src/server.ts",
      "language": "typescript",
      "indexed": true
    }
  ],
  "truncated": false
}
```

Semantics:

- substring/path matching is sufficient for V2;
- search the repository worktree, not only indexed files;
- ignore `.git`, generated graph databases, `node_modules`, and configurable ignored paths;
- report whether each file participates in the semantic graph.

This directly addresses the Task 001 failure where searching `server` as a symbol returned nothing even though `src/server.ts` existed.

### 5.2 `get_file_outline`

Return compact indexed symbols contained in a known file.

Request:

```json
{
  "path": "src/server.ts",
  "kinds": ["function", "class", "method"],
  "limit": 100
}
```

Response:

```json
{
  "path": "src/server.ts",
  "indexed": true,
  "symbols": [
    {
      "id": "ts:src/server.ts#serve",
      "kind": "function",
      "name": "serve",
      "signature": "serve(store: GraphStore, projectRoot: string): Promise<void>",
      "lines": [9, 80]
    }
  ],
  "truncated": false
}
```

For an unindexed file, return `indexed: false` and an empty symbol list rather than an error.

This is the correct operation when the agent knows the file but not the symbol name.

### 5.3 `inspect_symbol`

Return a compact structural neighborhood for a known symbol in one round trip.

Request:

```json
{
  "symbol": "ts:src/indexer.ts#indexTypeScriptProject",
  "include": ["callers", "callees", "references"],
  "depth": 1,
  "limit": 100,
  "source": "none"
}
```

Supported `include` values for V2:

- `callers`
- `callees`
- `reads`
- `writes`
- `references`
- `implements`
- `extends`

Supported source modes:

- `none`
- `signature`
- `body`

Response shape:

```json
{
  "symbol": { "id": "...", "name": "indexTypeScriptProject", "...": "..." },
  "relations": {
    "callers": { "nodes": [], "edges": [], "truncated": false },
    "callees": { "nodes": [], "edges": [], "truncated": false },
    "references": { "nodes": [], "edges": [], "truncated": false }
  },
  "source": null
}
```

`inspect_symbol` is intentionally an orchestration operation over existing deterministic store methods. It is not a new graph query language.

The purpose is to replace trajectories such as:

```text
get_symbol
get_callers
get_callees
get_neighbors
get_source
```

with one high-information request when appropriate.

### 5.4 `search_text`

Search repository text for concepts, literals, filenames, test names, configuration keys, and artifacts outside the semantic graph.

Request:

```json
{
  "query": "get_references",
  "paths": ["test", "src"],
  "extensions": ["mjs", "ts"],
  "limit": 50,
  "contextLines": 1
}
```

Response:

```json
{
  "matches": [
    {
      "path": "test/smoke.mjs",
      "line": 42,
      "text": "const writers = await call(\"get_references\", ...)",
      "before": [],
      "after": []
    }
  ],
  "truncated": false
}
```

Implementation should use an efficient local text-search mechanism. It does not need to populate the graph.

The server must clearly treat these results as textual matches rather than structural facts.

### 5.5 `search_symbols` revision

Keep `search_symbols`, but make its response self-describing and harder to misuse.

Request remains conceptually:

```json
{
  "query": "classifyAccess",
  "match": "exact",
  "kinds": ["function"],
  "limit": 20
}
```

V2 response:

```json
{
  "matches": [],
  "searched": "symbol_names",
  "match": "exact",
  "query": "classifyAccess",
  "truncated": false
}
```

An empty result must not be a bare `[]`.

Optional V2.1 enhancement: include cheap file-path suggestions when the query matches files but not symbols. V2 should not delay implementation for this if `find_files` is available and well described.

Do not silently increase the current maximum result limit merely to support repository enumeration. Whole-repository symbol enumeration is not the intended discovery path.

### 5.6 `get_source` revision

Keep lazy source-by-symbol retrieval, but remove language implying that source is permitted only after some minimum amount of graph navigation.

New description:

> Retrieve the signature or implementation of a known symbol. Prefer structural navigation first when the relevant symbol is not yet known.

This makes source retrieval a cheap terminal operation rather than a reward the agent must earn through graph calls.

### 5.7 Existing low-level graph tools

Retain these operations:

- `get_symbol`
- `get_neighbors`
- `get_callers`
- `get_callees`
- `get_references`
- `find_paths`
- `get_index_status`

They remain useful primitives and debugging surfaces. `inspect_symbol` is a convenience/orchestration layer above them, not a replacement.

## 6. Discovery strategy expected from agents

V2 tool descriptions should make the intended decision tree obvious without prescribing unnecessary graph usage.

### Known exact symbol

```text
search_symbols(exact)
  -> inspect_symbol and/or get_source
```

### Known file, unknown symbol

```text
find_files
  -> get_file_outline
  -> inspect_symbol and/or get_source
```

### Conceptual/textual clue

```text
search_text
  -> resolve discovered symbol/file
  -> structural navigation if useful
```

### Structural question

```text
search/resolve anchor symbol
  -> inspect_symbol / get_references / find_paths
```

The interface should not encourage repeated conceptual guesses against `search_symbols`.

## 7. Typed architecture

V2 preserves the existing boundary:

```text
MCP transport
    |
typed semantic request structs
    |
repository services / GraphStore
    |
handwritten SQL + filesystem/text search
    |
SQLite + worktree
```

Add request/result types rather than introducing a general query IR:

```ts
type FindFilesQuery = {
  query: string;
  extensions?: string[];
  limit: number;
};

type FileOutlineQuery = {
  path: string;
  kinds?: SymbolKind[];
  limit: number;
};

type InspectSymbolQuery = {
  symbol: SymbolId;
  include: InspectRelation[];
  depth: number;
  limit: number;
  source: "none" | "signature" | "body";
};

type TextSearchQuery = {
  query: string;
  paths?: string[];
  extensions?: string[];
  limit: number;
  contextLines: number;
};
```

`GraphStore` should continue to own graph semantics. Filesystem discovery/text search may live in a separate `RepositoryStore` or `RepositorySearch` service rather than being forced into `GraphStore`.

Recommended separation:

```text
GraphStore
  symbols / edges / paths / references

RepositorySearch
  files / text

SourceStore
  source by symbol / file ranges / freshness
```

Do not force these into a single abstraction solely because MCP exposes them together.

## 8. Telemetry

V2 should continue server-side telemetry and add enough fields to understand trajectory efficiency.

For every MCP call record:

```json
{
  "tool": "inspect_symbol",
  "requestBytes": 123,
  "responseBytes": 2100,
  "category": "graph",
  "durationMs": 12,
  "success": true
}
```

Categories:

- `graph`
- `text`
- `source`
- `metadata`

Benchmark summaries should report:

- MCP calls before first edit;
- total MCP calls;
- graph bytes/tokens;
- text-search bytes/tokens;
- source bytes/tokens;
- filesystem fallback calls;
- total agent tokens;
- wall time;
- task success.

The primary V2 navigation metric is:

> **agent decision points before the first correct edit**

Source bytes remain important but are secondary to trajectory efficiency.

## 9. Benchmark prompt revision

Condition B should no longer instruct the agent to use graph navigation as ceremony.

Recommended wording:

> You have a repository intelligence MCP server that can answer structural questions, locate files/symbols, search repository text, and retrieve source by symbol. Use these tools when they answer a question more directly than filesystem exploration. Retrieve source as soon as you have a plausible relevant symbol. Filesystem fallback is allowed where the server does not cover the needed artifact. Solve the task normally; do not maximize MCP usage.

The benchmark tests whether the interface is naturally useful, not whether an agent can be forced to use it.

## 10. V2 validation plan

### Task 001 rerun

Rerun Task 001 unchanged after V2 implementation.

Task 001 is now a regression benchmark for discovery overhead.

Target trajectory for the graph condition should be approximately:

```text
find_files("indexer") or search_text(...)
get_file_outline("src/indexer.ts")
inspect_symbol(indexTypeScriptProject)
get_source(classifyAccess)
```

Exact calls may differ, but success criteria are:

- fewer than 10 MCP calls before first edit;
- no whole-repository symbol enumeration;
- no long sequence of conceptual `search_symbols` guesses;
- task success preserved;
- total retrieval before first edit no worse than V1;
- total agent tokens materially closer to baseline than V1.

Task 001 does not need to prove the graph beats grep. It proves the repository-intelligence interface can get out of the way on a lexically easy task.

### Task 002

Use a task where the relevant implementation is discoverable from a known file or subsystem but the exact symbol name is not supplied. This tests `find_files`, `get_file_outline`, and `inspect_symbol` directly.

### Task 003

Use a structurally distributed task where grep is not expected to locate the answer in one or two calls. Example shape:

> A shared field is mutated from multiple paths. Identify all writers reachable from two entry points and fix the incorrect one without changing the legitimate writer.

This tests the original structural-retrieval hypothesis.

## 11. Implementation order

Implement V2 in this order:

1. `find_files`;
2. `get_file_outline`;
3. `inspect_symbol` with depth 1;
4. revised `search_symbols` response;
5. revised `get_source` description;
6. `search_text`;
7. telemetry categories/durations;
8. self-dogfood tests for all new operations;
9. rerun Task 001;
10. design Task 002/003 from observed trajectories.

Depth > 1 for `inspect_symbol` is optional until a dogfood task demonstrates value. Avoid turning it into a generic traversal DSL.

## 12. V2 success criterion

V2 succeeds if the server becomes a **trajectory compressor** rather than merely a source compressor.

For easy lexical tasks, it should approach the efficiency of direct search and avoid imposing graph ceremony.

For structurally distributed tasks, it should answer relationship questions outside the model and allow the agent to retrieve only the small number of implementations needed to make the change.

The refined thesis is:

> Deterministic program structure is valuable when it collapses multiple exploratory decisions into a small number of high-information repository-intelligence operations. The graph is a substrate, not the user-facing interaction model.
