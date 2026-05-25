import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";

const root = process.cwd();
const outDir = resolve(root, ".tmp-compiled");
mkdirSync(outDir, { recursive: true });

const cases = [
  { name: "graph", input: "examples/basic.mmdlog", output: ".tmp-compiled/basic.mmd" },
  { name: "sequence", input: "examples/sequence.mmdlog", output: ".tmp-compiled/sequence.mmd" },
  { name: "class", input: "examples/class.mmdlog", output: ".tmp-compiled/class.mmd" },
  { name: "state", input: "examples/state.mmdlog", output: ".tmp-compiled/state.mmd" },
  { name: "er", input: "examples/er.mmdlog", output: ".tmp-compiled/er.mmd" },
  { name: "journey", input: "examples/journey.mmdlog", output: ".tmp-compiled/journey.mmd" },
  { name: "gantt", input: "examples/gantt.mmdlog", output: ".tmp-compiled/gantt.mmd" },
  { name: "pie", input: "examples/pie.mmdlog", output: ".tmp-compiled/pie.mmd" },
  { name: "gitGraph", input: "examples/gitgraph.mmdlog", output: ".tmp-compiled/gitgraph.mmd" }
];

const { window } = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window = window;
globalThis.document = window.document;

const dompurifyModule = await import("dompurify");
const maybeFactory = dompurifyModule.default;
if (typeof maybeFactory === "function") {
  const instance = maybeFactory(window);
  maybeFactory.sanitize = instance.sanitize.bind(instance);
  maybeFactory.addHook = instance.addHook.bind(instance);
  maybeFactory.removeAllHooks = instance.removeAllHooks.bind(instance);
}

const { default: mermaid } = await import("mermaid");
mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });

for (const c of cases) {
  execFileSync("node", ["dist/cli.js", "compile", c.input, "-o", c.output], {
    stdio: "pipe",
    cwd: root
  });
}

const results = [];
for (const c of cases) {
  const code = readFileSync(resolve(root, c.output), "utf8");
  try {
    await mermaid.parse(code);
    results.push({ name: c.name, ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results.push({ name: c.name, ok: false, message });
  }
}

writeFileSync(resolve(root, ".tmp-compiled/validation.json"), `${JSON.stringify(results, null, 2)}\n`);

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  for (const f of failed) {
    console.error(`${f.name}: FAIL ${f.message}`);
  }
  process.exit(1);
}

for (const r of results) {
  console.log(`${r.name}: OK`);
}
