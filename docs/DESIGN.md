# MVP design

## Hypothesis

Program structure should be computed once by deterministic tooling and queried cheaply by agents, rather than repeatedly reconstructed from raw source.

## MVP boundary

The first implementation targets TypeScript and indexes symbols plus `CALLS`, `REFERENCES`, `READS`, `WRITES`, and `CONTAINS` edges. Full source remains canonical and is retrieved lazily by symbol ID.

The MCP surface intentionally exposes semantic operations rather than SQL or a graph DSL. A hidden query IR can be added once the primitive graph semantics stabilize.

## Agent workflow

1. `search_symbols` locates likely entry points.
2. `get_callers`, `get_callees`, `get_neighbors`, and `get_references` explore architecture using compact graph records.
3. The agent narrows the investigation to a few symbols.
4. `get_source` retrieves only those implementations.
5. A benchmark compares source tokens consumed against ordinary filesystem navigation.

## Epistemic model

Compiler-derived facts are authoritative graph data. Future probabilistic summaries or architecture labels must remain annotations and never be represented as exact compiler facts.

## Near-term work

- Make TypeScript symbol ownership and global detection robust.
- Add bounded multi-hop traversal and `find_paths`.
- Add project/file hashes and stale-index detection.
- Add tests against a small fixture repository.
- Add an evaluation harness that records graph responses and source bytes/tokens retrieved.
- Evaluate on structural debugging and change-impact tasks.

## Explicit non-goals for v0.1

No embeddings, LLM summaries, CFG, taint analysis, runtime traces, graph UI, or general-purpose graph database.
