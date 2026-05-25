import { test } from "node:test";
import assert from "node:assert/strict";
import { emitMermaid, parseMerlog, reduceEvents } from "../dist/core/index.js";

function emit(src) {
  const full = src.startsWith("@diagram") ? src : `@diagram graph TD\n${src}`;
  const { events } = parseMerlog(full, { strict: true });
  return emitMermaid(reduceEvents(events));
}

test("empty graph emits header only", () => {
  assert.equal(emit(""), "graph TD");
});

test("nodes in declaration order", () => {
  const out = emit("+B[BBB]\n+A[AAA]\n+C[CCC]");
  const lines = out.split("\n");
  assert.equal(lines[0], "graph TD");
  assert.equal(lines[1], '  B["BBB"]');
  assert.equal(lines[2], '  A["AAA"]');
  assert.equal(lines[3], '  C["CCC"]');
});

test("edges in declaration order", () => {
  const out = emit("+A\n+B\n+C\n+B --> C\n+A --> B\n+A --> C");
  const edgeLines = out.split("\n").filter((l) => l.includes("-->"));
  assert.deepEqual(edgeLines, ["  B --> C", "  A --> B", "  A --> C"]);
});

test("labels with quotes are escaped", () => {
  const out = emit('+A[say "hi"]');
  assert.match(out, /A\["say \\"hi\\""]/);
});

test("labels with backslashes are escaped", () => {
  const out = emit("+A[path\\to]");
  assert.match(out, /A\["path\\\\to"]/);
});

test("deterministic: same input produces same output", () => {
  const src = "+B\n+A\n+A --> B\n+A --> B";
  assert.equal(emit(src), emit(src));
});

test("dangling edge not in output (reducer filters)", () => {
  const out = emit("+A\n+A --> Z");
  assert.doesNotMatch(out, /-->/);
});

test("class diagram: emits class lines, members, relations", () => {
  const out = emit(
    "@diagram class\n+class User\n+member User -string id\n+member User +login(p) bool"
  );
  assert.match(out, /^classDiagram/);
  assert.match(out, /class User/);
  assert.match(out, /User : -string id/);
  assert.match(out, /User : \+login\(p\) bool/);
});

test("state diagram: states and transitions in declaration order", () => {
  const out = emit("@diagram state\n+state B\n+state A\n+A --> B");
  const lines = out.split("\n");
  assert.equal(lines[0], "stateDiagram-v2");
  assert.equal(lines[1], "  state B");
  assert.equal(lines[2], "  state A");
  assert.equal(lines[3], "  A --> B");
});

test("removed node not in output", () => {
  const out = emit("+A\n+B\n+A --> B\n-B");
  assert.doesNotMatch(out, /B/);
});
