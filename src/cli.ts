#!/usr/bin/env node
import path from "node:path";
import { indexTypeScriptProject } from "./indexer.js";
import { serve } from "./server.js";
import { GraphStore } from "./store.js";

const [command, projectArg = process.cwd(), dbArg] = process.argv.slice(2);
const projectRoot = path.resolve(projectArg);
const dbPath = path.resolve(dbArg ?? path.join(projectRoot, ".codegraph.sqlite"));
const store = new GraphStore(dbPath);

try {
  if (command === "index") {
    const stats = indexTypeScriptProject(projectRoot, store);
    console.log(JSON.stringify({ database: dbPath, ...stats }, null, 2));
    store.close();
  } else if (command === "serve") {
    await serve(store, projectRoot);
  } else {
    console.error("Usage: codegraph-mcp <index|serve> [project-root] [database-path]");
    process.exitCode = 2;
    store.close();
  }
} catch (error) {
  store.close();
  throw error;
}
