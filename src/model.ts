export const SYMBOL_KINDS = [
  "file", "module", "function", "method", "class", "interface",
  "type", "enum", "field", "global", "parameter",
] as const;
export type SymbolKind = (typeof SYMBOL_KINDS)[number];

export const EDGE_TYPES = [
  "CONTAINS", "CALLS", "MAY_CALL", "REFERENCES", "READS", "WRITES",
  "IMPLEMENTS", "EXTENDS", "IMPORTS",
] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export type SymbolId = string;
export type Direction = "in" | "out";
export type ReferenceAccess = "all" | "read" | "write";
export type SymbolMatch = "exact" | "contains";

export interface CodeSymbol {
  id: SymbolId;
  kind: SymbolKind;
  name: string;
  qualifiedName: string;
  file: string;
  startLine: number;
  endLine: number;
  signature?: string;
}

export interface GraphEdge {
  sourceId: SymbolId;
  type: EdgeType;
  targetId: SymbolId;
  provenance: "compiler" | "static-analysis" | "indexer";
  certainty: "exact" | "possible";
  file?: string;
  line?: number;
}

export interface GraphResult {
  nodes: CodeSymbol[];
  edges: GraphEdge[];
  truncated: boolean;
  matched?: number;
}

export interface GraphPath {
  nodes: CodeSymbol[];
  edges: GraphEdge[];
}

export interface PathResult {
  paths: GraphPath[];
  truncated: boolean;
}

// Semantic request types form the boundary between transports (MCP today) and
// graph execution (SQLite today). They intentionally describe intent rather
// than SQL or storage layout, and are not a general-purpose query language.
export interface SymbolSearchQuery {
  query: string;
  match: SymbolMatch;
  kinds?: SymbolKind[];
  limit: number;
}

export interface NeighborQuery {
  symbol: SymbolId;
  relations: EdgeType[];
  direction: Direction;
  limit: number;
}

export interface ReferenceQuery {
  symbol: SymbolId;
  access: ReferenceAccess;
  limit: number;
}

export interface PathQuery {
  from: SymbolId;
  to: SymbolId;
  relations: EdgeType[];
  maxDepth: number;
  maxPaths: number;
}
