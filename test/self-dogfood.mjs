import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = path.join(root, ".self-codegraph.sqlite");
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, "dist/cli.js"), "serve", root, db],
});
const client = new Client({ name: "codegraph-self-dogfood", version: "0.1.0" });
await client.connect(transport);

const call = async (name, args) => {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, undefined);
  assert.ok(Array.isArray(result.content) && result.content[0]?.type === "text");
  return JSON.parse(result.content[0].text);
};

const exactOne = async (query, kind) => {
  const matches = await call("search_symbols", {
    query,
    match: "exact",
    ...(kind ? { kinds: [kind] } : {}),
  });
  assert.equal(matches.length, 1, `Expected one exact ${kind ?? "symbol"} match for ${query}: ${JSON.stringify(matches)}`);
  return matches[0];
};

try {
  const findPaths = await exactOne("findPaths", "method");
  assert.equal(findPaths.file, "src/store.ts");

  const references = await exactOne("references", "method");
  assert.equal(references.file, "src/store.ts");

  const serve = await exactOne("serve", "function");
  assert.equal(serve.file, "src/server.ts");

  const callers = await call("get_callers", { symbol: findPaths.id });
  assert.ok(callers.nodes.some((node) => node.id === serve.id), JSON.stringify(callers));
  assert.ok(callers.edges.some((edge) => edge.type === "CALLS" && edge.sourceId === serve.id && edge.targetId === findPaths.id), JSON.stringify(callers));

  const paths = await call("find_paths", {
    from: serve.id,
    to: findPaths.id,
    relations: ["CALLS"],
    maxDepth: 3,
    maxPaths: 5,
  });
  assert.ok(paths.paths.length >= 1, JSON.stringify(paths));
  assert.equal(paths.paths[0].nodes[0].id, serve.id);
  assert.equal(paths.paths[0].nodes.at(-1).id, findPaths.id);

  const source = await call("get_source", { symbol: findPaths.id, view: "body" });
  assert.equal(source.file, "src/store.ts");
  assert.match(source.source, /WITH RECURSIVE walk/);
  assert.match(source.source, /maxDepth/);

  console.log(JSON.stringify({
    message: "Self-dogfood MCP test passed",
    structuralQuestions: 4,
    selfSymbols: { serve: serve.id, findPaths: findPaths.id, references: references.id },
  }));
} finally {
  await transport.close();
}
