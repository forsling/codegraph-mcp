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

export interface CodeSymbol {
  id: string;
  kind: SymbolKind;
  name: string;
  qualifiedName: string;
  file: string;
  startLine: number;
  endLine: number;
  signature?: string;
}

export interface GraphEdge {
  sourceId: string;
  type: EdgeType;
  targetId: string;
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
