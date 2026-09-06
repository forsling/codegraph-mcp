import fs from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { EDGE_TYPES, SYMBOL_KINDS, type EdgeType, type SymbolKind } from "./model.js";
import { GraphStore } from "./store.js";

export async function serve(store: GraphStore, projectRoot: string): Promise<void> {
  const server = new McpServer({ name: "codegraph-mcp", version: "0.1.0" });
  const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });

  server.registerTool("search_symbols", { description: "Find symbols by name without reading source.", inputSchema: { query: z.string(), kinds: z.array(z.enum(SYMBOL_KINDS)).optional(), limit: z.number().int().min(1).max(100).default(20) } },
    async ({ query, kinds, limit }) => json(store.searchSymbols({ query, kinds: kinds as SymbolKind[] | undefined, limit })));

  server.registerTool("get_symbol", { description: "Get compact metadata for a stable symbol id.", inputSchema: { symbol: z.string() } },
    async ({ symbol }) => json(store.getSymbol(symbol) ?? { error: "symbol_not_found" }));

  server.registerTool("get_neighbors", { description: "Traverse direct typed program relationships for a symbol.", inputSchema: { symbol: z.string(), relations: z.array(z.enum(EDGE_TYPES)).min(1), direction: z.enum(["in", "out"]).default("out"), limit: z.number().int().min(1).max(500).default(100) } },
    async ({ symbol, relations, direction, limit }) => json(store.neighbors({ symbol, relations: relations as EdgeType[], direction, limit })));

  server.registerTool("get_callers", { description: "Find functions that directly call a symbol.", inputSchema: { symbol: z.string(), limit: z.number().int().min(1).max(500).default(100) } },
    async ({ symbol, limit }) => json(store.neighbors({ symbol, relations: ["CALLS", "MAY_CALL"], direction: "in", limit })));

  server.registerTool("get_callees", { description: "Find functions directly called by a symbol.", inputSchema: { symbol: z.string(), limit: z.number().int().min(1).max(500).default(100) } },
    async ({ symbol, limit }) => json(store.neighbors({ symbol, relations: ["CALLS", "MAY_CALL"], direction: "out", limit })));

  server.registerTool("get_references", { description: "Find functions that read, write, or otherwise reference a symbol.", inputSchema: { symbol: z.string(), access: z.enum(["all", "read", "write"]).default("all"), limit: z.number().int().min(1).max(500).default(100) } },
    async ({ symbol, access, limit }) => json(store.references({ symbol, access, limit })));

  server.registerTool("find_paths", { description: "Find bounded simple paths between two symbols over selected relationship types.", inputSchema: { from: z.string(), to: z.string(), relations: z.array(z.enum(EDGE_TYPES)).min(1).default(["CALLS", "MAY_CALL"]), maxDepth: z.number().int().min(1).max(20).default(8), maxPaths: z.number().int().min(1).max(20).default(5) } },
    async ({ from, to, relations, maxDepth, maxPaths }) => json(store.findPaths({ from, to, relations: relations as EdgeType[], maxDepth, maxPaths })));

  server.registerTool("get_source", { description: "Retrieve source only after graph navigation identifies a relevant symbol.", inputSchema: { symbol: z.string(), view: z.enum(["signature", "body"]).default("body") } },
    async ({ symbol, view }) => {
      const s = store.getSymbol(symbol);
      if (!s) return json({ error: "symbol_not_found" });
      if (view === "signature") return json({ symbol: s.id, signature: s.signature, location: `${s.file}:${s.startLine}` });
      const full = path.resolve(projectRoot, s.file);
      if (!full.startsWith(path.resolve(projectRoot) + path.sep)) return json({ error: "invalid_source_path" });
      const lines = fs.readFileSync(full, "utf8").split(/\r?\n/).slice(s.startLine - 1, s.endLine);
      return json({ symbol: s.id, file: s.file, lines: [s.startLine, s.endLine], source: lines.join("\n") });
    });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
