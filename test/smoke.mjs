import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(root, "fixtures/basic");
const db = path.join(fixture, ".codegraph.sqlite");
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, "dist/cli.js"), "serve", fixture, db],
});
const client = new Client({ name: "codegraph-smoke", version: "0.1.0" });
await client.connect(transport);

const call = async (name, args) => {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, undefined);
  assert.ok(Array.isArray(result.content) && result.content[0]?.type === "text");
  return JSON.parse(result.content[0].text);
};

const findOne = async (query) => {
  const matches = await call("search_symbols", { query });
  assert.equal(matches.length, 1, JSON.stringify(matches));
  return matches[0];
};

try {
  const tenant = await findOne("currentTenant");
  assert.equal(tenant.kind, "global");

  const writes = await call("get_references", { symbol: tenant.id, access: "write" });
  assert.ok(writes.nodes.some((x) => x.name === "setCurrentTenant"), JSON.stringify(writes));
  assert.ok(writes.edges.some((x) => x.type === "WRITES" && x.targetId === tenant.id), JSON.stringify(writes));

  const invoice = await findOne("calculateInvoice");
  const tax = await findOne("calculateTax");
  const checkout = await findOne("checkout");

  const callees = await call("get_callees", { symbol: invoice.id });
  assert.ok(callees.nodes.some((x) => x.name === "calculateTax"), JSON.stringify(callees));
  assert.ok(callees.edges.some((x) => x.type === "CALLS" && x.targetId === tax.id), JSON.stringify(callees));

  const paths = await call("find_paths", {
    from: checkout.id,
    to: tax.id,
    relations: ["CALLS"],
    maxDepth: 4,
    maxPaths: 5,
  });
  assert.equal(paths.paths.length, 1, JSON.stringify(paths));
  assert.deepEqual(paths.paths[0].nodes.map((x) => x.name), ["checkout", "calculateInvoice", "calculateTax"]);
  assert.deepEqual(paths.paths[0].edges.map((x) => x.type), ["CALLS", "CALLS"]);

  const tooShallow = await call("find_paths", {
    from: checkout.id,
    to: tax.id,
    relations: ["CALLS"],
    maxDepth: 1,
    maxPaths: 5,
  });
  assert.equal(tooShallow.paths.length, 0);

  const source = await call("get_source", { symbol: invoice.id, view: "body" });
  assert.match(source.source, /currentTenant/);
  assert.match(source.source, /calculateTax/);

  console.log("MCP smoke test passed");
} finally {
  await transport.close();
}
