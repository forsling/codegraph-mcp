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

try {
  const tenantMatches = await call("search_symbols", { query: "currentTenant" });
  assert.equal(tenantMatches.length, 1);
  assert.equal(tenantMatches[0].kind, "global");
  const tenantId = tenantMatches[0].id;

  const writes = await call("get_references", { symbol: tenantId, access: "write" });
  assert.ok(writes.some((x) => x.name === "setCurrentTenant"), JSON.stringify(writes));

  const invoices = await call("search_symbols", { query: "calculateInvoice" });
  assert.equal(invoices.length, 1);
  const invoiceId = invoices[0].id;

  const callees = await call("get_callees", { symbol: invoiceId });
  assert.ok(callees.some((x) => x.name === "calculateTax"), JSON.stringify(callees));

  const source = await call("get_source", { symbol: invoiceId, view: "body" });
  assert.match(source.source, /currentTenant/);
  assert.match(source.source, /calculateTax/);

  console.log("MCP smoke test passed");
} finally {
  await transport.close();
}
