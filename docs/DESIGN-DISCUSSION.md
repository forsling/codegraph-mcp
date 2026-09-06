# Design discussion: graph-native code intelligence for agents

## Thesis

Source code remains canonical, but raw source should not be the agent's primary repository-navigation substrate. Program structure can be computed once by deterministic tooling and queried cheaply. Full source becomes a lazy, higher-cost retrieval step after the agent has identified relevant symbols.

The intended investigation loop is:

1. Locate symbols using compact metadata.
2. Traverse deterministic program relationships.
3. Ask structural questions such as callers, callees, reads, writes, implementations, and paths.
4. Narrow the investigation to a small set of symbols.
5. Retrieve full implementations only for those symbols.

This is analogous to querying a database rather than handing every row to a model and asking it to reconstruct the query result.

## Representation

The initial representation is a multi-resolution program graph, with the MVP focused on symbol-level structure.

Nodes include functions, methods, classes, interfaces, types, fields, globals, and parameters. Edges include `CALLS`, `MAY_CALL`, `READS`, `WRITES`, `REFERENCES`, `CONTAINS`, `IMPLEMENTS`, `EXTENDS`, and `IMPORTS`.

Graph facts must retain provenance and certainty. Compiler-resolved facts are authoritative deterministic facts; uncertain static resolution must be represented as possible rather than silently promoted to exact. Future runtime observations and model-generated semantic annotations should remain distinguishable from compiler/static-analysis facts.

## MCP boundary

MCP is the agent-facing protocol boundary. It exposes semantic operations rather than raw storage or a general graph language. Initial operations include symbol search, symbol metadata, neighbors, callers, callees, references, paths, and lazy source retrieval.

Stable symbol IDs are the currency between calls. Names are used for discovery; subsequent operations should prefer symbol IDs.

The MCP layer is transport and validation only. It should not contain SQL or own graph semantics.

## Query architecture

We explicitly do **not** want to invent a general code query language yet.

The current architecture is:

```text
MCP layer
  -> typed semantic request structs
  -> GraphStore
  -> handwritten SQL
  -> SQLite
```

Request structs describe intent rather than storage mechanics. Examples are `SymbolSearchQuery`, `NeighborQuery`, `ReferenceQuery`, and `PathQuery`.

`GraphStore` owns the meaning of operations such as `neighbors`, `references`, and eventually `findPaths`. SQLite is the current execution engine, not part of the public semantics.

This separation gives us:

- MCP handlers that remain small and transport-only;
- localized and inspectable SQL;
- domain requests that can be tested without running MCP;
- freedom to evolve the physical schema without changing MCP semantics;
- a natural point to introduce richer planning later if real query composition demands it.

We deliberately avoid a single generic `GraphQuery` algebra for now. A generic IR/query language becomes justified only when multiple public operations repeatedly need to compose the same primitives in materially different ways. Until then it would add planner/compiler/debugging complexity without validating the product hypothesis.

## Why not compile MCP directly to SQL?

Direct MCP-to-SQL is initially shorter, but couples public tool semantics to today's physical schema. A semantic request/store boundary prevents SQL from leaking into transport code while remaining much simpler than a general query IR.

For example, `access: "write"` currently maps closely to a `WRITES` edge. Later its semantics might incorporate alias analysis, field mutation, interprocedural effects, or runtime evidence. That evolution should belong to `GraphStore`, not require MCP handlers to know how writes are represented physically.

## Source retrieval

Source retrieval is intentionally separate from graph querying. `get_source(symbol, view)` resolves a stable symbol to source only after graph navigation has selected it. Initial views are signature and full body; future source slicing may retrieve only statements relevant to a particular effect or dataflow question.

The graph is derived and disposable. Source remains canonical.

## Storage

SQLite is the MVP store. The graph shape and bounded traversals do not justify a graph database yet. Indexed `symbols` and `edges` tables plus recursive CTEs are sufficient for the initial experiment and make behavior easy to inspect.

Backend portability is not itself a goal. The semantic store boundary is primarily protection against our own graph representation changing as the analysis becomes richer.

## Evaluation hypothesis

The MVP succeeds if an agent can inspect many structural relationships, select a few relevant functions, retrieve only those implementations, and solve repository tasks while consuming substantially fewer source tokens than a filesystem/search-based agent.

Primary comparisons should measure task success, source tokens retrieved, total context tokens, functions/files opened, graph queries, and time/tool calls to the first relevant implementation.

## Deliberate non-goals for the MVP

Do not initially add a general query DSL, embeddings, model-generated summaries, full CFGs, taint analysis, arbitrary interprocedural dataflow, runtime tracing, git-history relationships, or a graphical IDE. Those are extensions to evaluate after the basic graph-navigation hypothesis is measurable.

## Near-term implementation sequence

1. Keep the TypeScript compiler as the first language frontend.
2. Make semantic request structs the MCP-to-store boundary.
3. Validate indexing and graph semantics against fixtures.
4. Implement bounded `find_paths` behind `PathQuery`.
5. Add stale-index detection.
6. Build the benchmark harness comparing graph navigation with conventional source browsing.
7. Only then decide whether repeated query composition warrants a richer internal query representation.
