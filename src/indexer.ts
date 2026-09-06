import path from "node:path";
import ts from "typescript";
import type { CodeSymbol, GraphEdge, SymbolKind } from "./model.js";
import { GraphStore } from "./store.js";

export interface IndexStats { files: number; symbols: number; edges: number; }

export function indexTypeScriptProject(projectPath: string, store: GraphStore): IndexStats {
  const configPath = ts.findConfigFile(projectPath, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) throw new Error(`No tsconfig.json found from ${projectPath}`);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const checker = program.getTypeChecker();
  const root = path.dirname(configPath);
  let files = 0, symbols = 0, edges = 0;
  store.clear();

  const idByTsSymbol = new Map<ts.Symbol, string>();
  const ownerByNode = new Map<ts.Node, string>();

  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile || !source.fileName.startsWith(root)) continue;
    files++;
    const rel = path.relative(root, source.fileName).replaceAll(path.sep, "/");

    const visit = (node: ts.Node, owner?: string) => {
      const declared = declarationSymbol(node, checker, rel, source);
      let nextOwner = owner;
      if (declared) {
        store.putSymbol(declared.codeSymbol);
        idByTsSymbol.set(declared.tsSymbol, declared.codeSymbol.id);
        symbols++;
        if (["function", "method"].includes(declared.codeSymbol.kind)) nextOwner = declared.codeSymbol.id;
        if (owner && owner !== declared.codeSymbol.id) {
          store.putEdge(edge(owner, "CONTAINS", declared.codeSymbol.id, rel, lineOf(source, node)));
          edges++;
        }
      }
      if (nextOwner) ownerByNode.set(node, nextOwner);
      ts.forEachChild(node, (child) => visit(child, nextOwner));
    };
    visit(source);
  }

  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile || !source.fileName.startsWith(root)) continue;
    const rel = path.relative(root, source.fileName).replaceAll(path.sep, "/");
    const walk = (node: ts.Node, owner?: string) => {
      const nextOwner = ownerByNode.get(node) ?? owner;
      if (nextOwner && ts.isCallExpression(node)) {
        const target = resolveId(checker.getSymbolAtLocation(node.expression), idByTsSymbol, checker);
        if (target) { store.putEdge(edge(nextOwner, "CALLS", target, rel, lineOf(source, node))); edges++; }
      }
      if (nextOwner && ts.isIdentifier(node) && !isDeclarationName(node)) {
        const targetSymbol = checker.getSymbolAtLocation(node);
        const target = resolveId(targetSymbol, idByTsSymbol, checker);
        if (target && target !== nextOwner) {
          const access = classifyAccess(node);
          store.putEdge(edge(nextOwner, access, target, rel, lineOf(source, node)));
          edges++;
        }
      }
      ts.forEachChild(node, (child) => walk(child, nextOwner));
    };
    walk(source);
  }
  return { files, symbols, edges };
}

function declarationSymbol(node: ts.Node, checker: ts.TypeChecker, rel: string, source: ts.SourceFile): { tsSymbol: ts.Symbol; codeSymbol: CodeSymbol } | undefined {
  const named = node as ts.NamedDeclaration;
  if (!named.name || !ts.isIdentifier(named.name)) return undefined;
  const kind = kindOf(node);
  if (!kind) return undefined;
  const symbol = checker.getSymbolAtLocation(named.name);
  if (!symbol) return undefined;
  const name = named.name.text;
  const qname = checker.getFullyQualifiedName(symbol).replace(/^".*"\./, "");
  const start = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const end = source.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  const signature = callableSignature(node, checker);
  return { tsSymbol: symbol, codeSymbol: { id: `ts:${rel}#${qname}`, kind, name, qualifiedName: qname, file: rel, startLine: start, endLine: end, signature } };
}

function kindOf(node: ts.Node): SymbolKind | undefined {
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) return "function";
  if (ts.isMethodDeclaration(node)) return "method";
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isTypeAliasDeclaration(node)) return "type";
  if (ts.isEnumDeclaration(node)) return "enum";
  if (ts.isPropertyDeclaration(node)) return "field";
  if (ts.isParameter(node)) return "parameter";
  if (ts.isVariableDeclaration(node) && node.parent?.parent?.parent && ts.isSourceFile(node.parent.parent.parent)) return "global";
  return undefined;
}

function callableSignature(node: ts.Node, checker: ts.TypeChecker): string | undefined {
  if (!ts.isFunctionLike(node)) return undefined;
  const sig = checker.getSignatureFromDeclaration(node);
  return sig ? checker.signatureToString(sig) : undefined;
}

function resolveId(symbol: ts.Symbol | undefined, ids: Map<ts.Symbol, string>, checker: ts.TypeChecker): string | undefined {
  if (!symbol) return undefined;
  if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  return ids.get(symbol);
}

function classifyAccess(node: ts.Identifier): "READS" | "WRITES" | "REFERENCES" {
  const p = node.parent;
  if (ts.isBinaryExpression(p) && p.left === node) {
    const assignment = p.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && p.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
    if (assignment) return "WRITES";
  }
  if ((ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) && (p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken)) return "WRITES";
  return "READS";
}

function isDeclarationName(node: ts.Identifier): boolean {
  return (node.parent as ts.NamedDeclaration).name === node;
}

function edge(sourceId: string, type: GraphEdge["type"], targetId: string, file: string, line: number): GraphEdge {
  return { sourceId, type, targetId, provenance: "compiler", certainty: "exact", file, line };
}

function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}
