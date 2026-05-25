import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMerlog, replayTimeline, reduceEvents, emitMermaid, reducePrefixes } from "../dist/core/index.js";

function parse(src) {
  const full = src.startsWith("@diagram") ? src : `@diagram graph TD\n${src}`;
  return parseMerlog(full, { strict: true });
}

function frames(src) {
  const { events } = parse(src);
  return replayTimeline(events);
}

test("N events produce N prefixes from reducePrefixes", () => {
  const { events } = parse("+A\n+B\n+A --> B");
  const states = reducePrefixes(events);
  assert.equal(states.length, events.length);
});

test("replayTimeline drops silent events", () => {
  const fs = frames("!+A\n!+B\n+A --> B");
  assert.equal(fs.length, 1);
  assert.equal(fs[0].event.kind, "add_edge");
});

test("replayTimeline preserves step numbers (gaps when silent)", () => {
  const fs = frames("+A\n!+B\n+A --> B");
  // step 1 = @diagram (silent), step 2 = +A, step 3 = !+B (silent), step 4 = edge
  assert.deepEqual(fs.map((f) => f.step), [2, 4]);
});

test("each frame mermaid is non-empty", () => {
  const fs = frames("+A\n+B\n+A --> B");
  for (const f of fs) assert.ok(f.mermaid.length > 0);
});

test("last frame state matches reduceEvents", () => {
  const src = "+A\n+B\n+A --> B\n-B";
  const { events } = parse(src);
  const fs = replayTimeline(events);
  const final = reduceEvents(events);
  assert.equal(fs[fs.length - 1].mermaid, emitMermaid(final));
});

test("frame after delete still emits valid mermaid (no dangling edge)", () => {
  const fs = frames("+A\n+B\n+A --> B\n-B");
  const last = fs[fs.length - 1].mermaid;
  assert.doesNotMatch(last, /B\[/);
  assert.doesNotMatch(last, /-->/);
});

test("recreate after delete produces correct state", () => {
  const fs = frames("+A\n+B\n-B\n+B[y2]");
  const last = fs[fs.length - 1].mermaid;
  assert.match(last, /B\["y2"\]/);
});
