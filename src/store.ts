import Database from "better-sqlite3";
import type {
  CodeSymbol,
  GraphEdge,
  GraphResult,
  NeighborQuery,
  ReferenceQuery,
  SymbolSearchQuery,
} from "./model.js";

export class GraphStore {
  readonly db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS symbols (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        qualified_name TEXT NOT NULL,
        file TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        signature TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
      CREATE INDEX IF NOT EXISTS idx_symbols_qname ON symbols(qualified_name);

      CREATE TABLE IF NOT EXISTS edges (
        source_id TEXT NOT NULL,
        edge_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        provenance TEXT NOT NULL,
        certainty TEXT NOT NULL,
        file TEXT,
        line INTEGER,
        UNIQUE(source_id, edge_type, target_id, file, line)
      );
      CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id, edge_type);
      CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id, edge_type);

      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        language TEXT NOT NULL,
        indexed_at TEXT NOT NULL
      );
    `);
  }

  clear(): void {
    this.db.exec("DELETE FROM edges; DELETE FROM symbols; DELETE FROM files;");
  }

  putSymbol(symbol: CodeSymbol): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO symbols
      (id, kind, name, qualified_name, file, start_line, end_line, signature)
      VALUES (@id, @kind, @name, @qualifiedName, @file, @startLine, @endLine, @signature)
    `).run({ ...symbol, signature: symbol.signature ?? null });
  }

  putEdge(edge: GraphEdge): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO edges
      (source_id, edge_type, target_id, provenance, certainty, file, line)
      VALUES (@sourceId, @type, @targetId, @provenance, @certainty, @file, @line)
    `).run({ ...edge, file: edge.file ?? null, line: edge.line ?? null });
  }

  getSymbol(id: string): CodeSymbol | undefined {
    return this.mapSymbol(this.db.prepare("SELECT * FROM symbols WHERE id = ?").get(id));
  }

  searchSymbols(request: SymbolSearchQuery): CodeSymbol[] {
    const { query, kinds, limit } = request;
    const pattern = `%${query}%`;
    const kindClause = kinds?.length ? `AND kind IN (${kinds.map(() => "?").join(",")})` : "";
    const rows = this.db.prepare(`
      SELECT * FROM symbols
      WHERE (name LIKE ? OR qualified_name LIKE ?) ${kindClause}
      ORDER BY CASE WHEN name = ? THEN 0 WHEN name LIKE ? THEN 1 ELSE 2 END, length(qualified_name)
      LIMIT ?
    `).all(pattern, pattern, ...(kinds ?? []), query, `${query}%`, limit);
    return rows.map((r) => this.mapSymbol(r)!).filter(Boolean);
  }

  neighbors(request: NeighborQuery): GraphResult {
    const { symbol, relations, direction, limit } = request;
    if (!relations.length) return { nodes: [], edges: [], truncated: false };
    const placeholders = relations.map(() => "?").join(",");
    const column = direction === "out" ? "source_id" : "target_id";
    const rows = this.db.prepare(`SELECT * FROM edges WHERE ${column} = ? AND edge_type IN (${placeholders}) LIMIT ?`)
      .all(symbol, ...relations, limit + 1);
    const truncated = rows.length > limit;
    const edges = rows.slice(0, limit).map((r) => this.mapEdge(r));
    const nodeIds = new Set(edges.flatMap((e) => [e.sourceId, e.targetId]));
    const nodes = [...nodeIds].map((nodeId) => this.getSymbol(nodeId)).filter((x): x is CodeSymbol => Boolean(x));
    return { nodes, edges, truncated };
  }

  references(request: ReferenceQuery): GraphResult {
    const relations = request.access === "read"
      ? ["READS"] as const
      : request.access === "write"
        ? ["WRITES"] as const
        : ["REFERENCES", "READS", "WRITES"] as const;
    return this.neighbors({
      symbol: request.symbol,
      relations: [...relations],
      direction: "in",
      limit: request.limit,
    });
  }

  close(): void { this.db.close(); }

  private mapSymbol(row: any): CodeSymbol | undefined {
    if (!row) return undefined;
    return { id: row.id, kind: row.kind, name: row.name, qualifiedName: row.qualified_name, file: row.file, startLine: row.start_line, endLine: row.end_line, signature: row.signature ?? undefined };
  }

  private mapEdge(row: any): GraphEdge {
    return { sourceId: row.source_id, type: row.edge_type, targetId: row.target_id, provenance: row.provenance, certainty: row.certainty, file: row.file ?? undefined, line: row.line ?? undefined };
  }
}
