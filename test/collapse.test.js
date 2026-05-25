import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseMmdlog, replayTimeline } from "../dist/core/index.js";
import { writeFrames } from "../dist/replay/renderer.js";

async function setupOutDir() {
  return mkdtemp(join(tmpdir(), "mmdlog-collapse-"));
}

test("writeFrames collapses consecutive duplicates by default (mmd)", async () => {
  const src = "@diagram graph TD\n+A\n+B\n+A --> B\n+A --> B";
  const { events } = parseMmdlog(src, { strict: true });
  const frames = replayTimeline(events);
  assert.equal(frames.length, 4);

  const dir = await setupOutDir();
  try {
    const written = await writeFrames(frames, dir, "mmd");
    assert.equal(written.length, 3, "duplicate frame should be collapsed");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".mmd"));
    assert.equal(files.length, 3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("writeFrames preserves all frames when collapse=false", async () => {
  const src = "@diagram graph TD\n+A\n+B\n+A --> B\n+A --> B";
  const { events } = parseMmdlog(src, { strict: true });
  const frames = replayTimeline(events);

  const dir = await setupOutDir();
  try {
    const written = await writeFrames(frames, dir, "mmd", undefined, undefined, false);
    assert.equal(written.length, 4);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("writeFrames collapses runs of duplicates, not just pairs", async () => {
  const src = "@diagram graph TD\n+A\n+A --> B\n+A --> B\n+A --> B\n+A --> B";
  const { events } = parseMmdlog(src, { strict: true });
  const frames = replayTimeline(events);
  assert.equal(frames.length, 5);

  const dir = await setupOutDir();
  try {
    const written = await writeFrames(frames, dir, "mmd");
    assert.equal(written.length, 1, "all 5 produce identical mermaid (no nodes, dangling edges filtered)");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
