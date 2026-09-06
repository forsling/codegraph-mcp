# Task 001 — classify property writes correctly

Starting from the benchmark base commit, fix the TypeScript indexer so writes through property access are represented as `WRITES` edges instead of reads.

Examples that should count as writes include:

```ts
state.currentTenant = tenant;
state.count += 1;
state.count++;
```

Reads such as these must remain reads:

```ts
return state.currentTenant;
console.log(state.count);
```

Add or extend a fixture and tests that demonstrate the behavior through the public MCP graph interface, not only by unit-testing a helper.

Keep the change focused. Do not redesign the graph model or add dataflow analysis.

## Success criteria

- TypeScript typecheck passes.
- Existing fixture and self-dogfood MCP tests remain green.
- A public MCP query can identify a function that writes the property as a writer.
- A function that only reads the property is not returned by `get_references(..., access="write")`.
- Compound assignment and increment/decrement property writes are covered.
