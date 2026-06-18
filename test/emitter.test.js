import { test } from "node:test";
import assert from "node:assert/strict";
import { emitMermaid, emitMermaidWithDelta, parseMmdlog, reduceEvents } from "../dist/core/index.js";

function reduceAfterEvents(src, count) {
  const full = src.startsWith("@diagram") ? src : `@diagram graph TD\n${src}`;
  const { events } = parseMmdlog(full, { strict: true });
  return reduceEvents(events.slice(0, count));
}

function emit(src) {
  const full = src.startsWith("@diagram") ? src : `@diagram graph TD\n${src}`;
  const { events } = parseMmdlog(full, { strict: true });
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

test("delta: first frame highlights all nodes (prev=null)", () => {
  const state = reduceAfterEvents("+A\n+B", 3);
  const out = emitMermaidWithDelta(state, null);
  assert.match(out.mermaid, /classDef _mmdlog_new/);
  assert.match(out.mermaid, /class A,B _mmdlog_new/);
});

test("delta: only newly-added node is highlighted", () => {
  const prev = reduceAfterEvents("+A\n+B", 2);
  const curr = reduceAfterEvents("+A\n+B", 3);
  const out = emitMermaidWithDelta(curr, prev);
  assert.match(out.mermaid, /class B _mmdlog_new/);
  assert.doesNotMatch(out.mermaid, /class A,/);
});

test("delta: newly-added edge gets linkStyle by index", () => {
  const prev = reduceAfterEvents("+A\n+B\n+A --> B\n+B --> A", 4);
  const curr = reduceAfterEvents("+A\n+B\n+A --> B\n+B --> A", 5);
  const out = emitMermaidWithDelta(curr, prev);
  assert.match(out.mermaid, /linkStyle 1 stroke:#16a34a/);
});

test("delta: no additions = no directives", () => {
  const state = reduceAfterEvents("+A\n+B\n+A --> B", 4);
  const out = emitMermaidWithDelta(state, state);
  assert.doesNotMatch(out.mermaid, /_mmdlog_new/);
  assert.doesNotMatch(out.mermaid, /linkStyle/);
  assert.equal(out.svgStyle, undefined);
});

test("delta: class diagram emits svgStyle CSS for added class", () => {
  const state = reduceAfterEvents("@diagram class\n+class User", 2);
  const out = emitMermaidWithDelta(state, null);
  assert.doesNotMatch(out.mermaid, /_mmdlog_new/);
  assert.match(out.mermaid, /^classDiagram/);
  assert.match(out.svgStyle ?? "", /\[id\*="-classId-User-"\]/);
});

test("delta: sequence diagram emits svgStyle CSS for added participant", () => {
  const state = reduceAfterEvents("@diagram sequence\n+participant A as Alice\n+participant B as Bob", 3);
  const out = emitMermaidWithDelta(state, null);
  assert.match(out.svgStyle ?? "", /\[data-id="A"\] rect\.actor/);
  assert.match(out.svgStyle ?? "", /\[data-id="B"\] rect\.actor/);
  assert.match(out.svgStyle ?? "", /#16a34a/);
});

test("delta: sequence diagram emits svgStyle CSS for added message", () => {
  // Use prev with an existing message so the new add is NOT the first visible step.
  const src = "@diagram sequence\n+participant A\n+participant B\n+A->>B: first\n+A->>B: second";
  const prev = reduceAfterEvents(src, 4);
  const curr = reduceAfterEvents(src, 5);
  const out = emitMermaidWithDelta(curr, prev);
  assert.match(out.svgStyle ?? "", /\[data-id="i2"\]/);
  assert.doesNotMatch(out.svgStyle ?? "", /\[data-id="A"\] rect\.actor/); // participants unchanged (not first visible step)
});

test("delta: state diagram tints state and transition by index", () => {
  const prev = reduceAfterEvents("@diagram state\n+state Idle\n+state Loading\n+Idle --> Loading", 3);
  const curr = reduceAfterEvents("@diagram state\n+state Idle\n+state Loading\n+Idle --> Loading", 4);
  const out = emitMermaidWithDelta(curr, prev);
  assert.match(out.svgStyle ?? "", /\[data-id="edge0"\]/);
});

test("delta: er diagram tints added entity", () => {
  const out = emitMermaidWithDelta(reduceAfterEvents("@diagram er\n+entity USER", 2), null);
  assert.match(out.svgStyle ?? "", /\[id\*="-entity-USER-"\]/);
});

test("delta: gantt diagram tints added title and section", () => {
  const out = emitMermaidWithDelta(reduceAfterEvents("@diagram gantt\n+title Plan\n+section Core", 3), null);
  assert.match(out.svgStyle ?? "", /\.titleText/);
  assert.match(out.svgStyle ?? "", /\.section0/);
});

test("delta: pie diagram tints added title and slice", () => {
  const out = emitMermaidWithDelta(reduceAfterEvents('@diagram pie\n+title Share\n+"API" : 45', 3), null);
  assert.match(out.svgStyle ?? "", /\.pieTitleText/);
  assert.match(out.svgStyle ?? "", /text\.slice:nth-of-type\(1\)/);
});

test("delta: gitGraph tints added commit by id", () => {
  const out = emitMermaidWithDelta(reduceAfterEvents('@diagram gitGraph\n+commit id: "c1"', 2), null);
  assert.match(out.svgStyle ?? "", /circle\.commit\.c1/);
});

test("delta: journey tints added section by index", () => {
  const out = emitMermaidWithDelta(reduceAfterEvents("@diagram journey\n+section Intro", 2), null);
  assert.match(out.svgStyle ?? "", /section-type-0/);
});
