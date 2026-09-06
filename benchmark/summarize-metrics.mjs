import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node benchmark/summarize-metrics.mjs <metrics.jsonl>");
  process.exit(2);
}

const events = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const summary = {
  calls: events.length,
  graphBytes: 0,
  sourceBytes: 0,
  estimatedGraphTokens: 0,
  estimatedSourceTokens: 0,
  byTool: {},
};
for (const event of events) {
  const prefix = event.category === "source" ? "source" : "graph";
  summary[`${prefix}Bytes`] += event.responseBytes ?? 0;
  summary[`estimated${prefix[0].toUpperCase()}${prefix.slice(1)}Tokens`] += event.estimatedTokens ?? 0;
  summary.byTool[event.tool] ??= { calls: 0, bytes: 0, estimatedTokens: 0 };
  summary.byTool[event.tool].calls += 1;
  summary.byTool[event.tool].bytes += event.responseBytes ?? 0;
  summary.byTool[event.tool].estimatedTokens += event.estimatedTokens ?? 0;
}
summary.totalBytes = summary.graphBytes + summary.sourceBytes;
summary.estimatedTotalTokens = summary.estimatedGraphTokens + summary.estimatedSourceTokens;
console.log(JSON.stringify(summary, null, 2));
