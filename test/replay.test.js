import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMmdlog, replayTimeline, reduceEvents, emitMermaid, reducePrefixes } from "../dist/core/index.js";

function parse(src) {
  const full = src.startsWith("@diagram") ? src : `@diagram graph TD\n${src}`;
  return parseMmdlog(full, { strict: true });
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

test("highlight + flash: delta step splits into flash frame then plain settle frame", () => {
  const { events } = parse("+A\n+B");
  const fs = replayTimeline(events, { highlight: true, flash: true });
  // step 2 (+A): flash + settle, step 3 (+B): flash + settle
  assert.equal(fs.length, 4);
  assert.equal(fs[0].flash, true);
  assert.match(fs[0].mermaid, /_mmdlog_new/);
  assert.equal(fs[1].flash, undefined);
  assert.doesNotMatch(fs[1].mermaid, /_mmdlog_new/);
});

test("highlight without flash: one highlighted frame per delta step", () => {
  const { events } = parse("+A\n+B");
  const fs = replayTimeline(events, { highlight: true });
  assert.equal(fs.length, 2);
  for (const f of fs) {
    assert.equal(f.flash, undefined);
    assert.match(f.mermaid, /_mmdlog_new/);
  }
});

test("highlight + flash: removal step gets a red flash on the pre-removal state", () => {
  const { events } = parse("+A\n+B\n+A --> B\n-B");
  const fs = replayTimeline(events, { highlight: true, flash: true });
  // step 5 (-B): red flash showing prev (A,B,A-->B) then settle (A only)
  const flash = fs.find((f) => f.flash && f.mermaid.includes("_mmdlog_del"));
  assert.ok(flash, "expected a red removal flash frame");
  assert.match(flash.mermaid, /B\["B"\]/); // pre-removal: B still present
  assert.match(flash.mermaid, /class B _mmdlog_del/); // B tinted red
  assert.match(flash.mermaid, /linkStyle 0 stroke:#dc2626/); // removed edge tinted red
  const last = fs[fs.length - 1];
  assert.doesNotMatch(last.mermaid, /B\[/); // settle: B gone
  assert.doesNotMatch(last.mermaid, /_mmdlog_del/);
});

test("highlight without flash: removal step shows plain post-removal state (no red)", () => {
  const { events } = parse("+A\n+B\n+A --> B\n-B");
  const fs = replayTimeline(events, { highlight: true });
  const last = fs[fs.length - 1];
  assert.doesNotMatch(last.mermaid, /_mmdlog_del/);
  assert.doesNotMatch(last.mermaid, /B\[/);
});
