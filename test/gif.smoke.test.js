import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseMmdlog, replayTimeline } from "../dist/core/index.js";
import { writeGif } from "../dist/replay/renderer.js";

test("writeGif produces a valid GIF file", async () => {
  const src = "@diagram graph TD\n+A[API]\n+B[DB]\n+A --> B";
  const { events } = parseMmdlog(src, { strict: true });
  const frames = replayTimeline(events);

  const out = join(tmpdir(), `mmdlog-smoke-${Date.now()}.gif`);
  try {
    const written = await writeGif(frames, out, 2, 320, 240);
    assert.equal(written, out);

    const buf = await readFile(out);
    assert.ok(buf.length > 100, "gif should be non-trivially sized");
    assert.equal(buf.subarray(0, 6).toString("ascii"), "GIF89a");
  } finally {
    await rm(out, { force: true });
  }
});

test("writeGif handles silent events (final visible frame only)", async () => {
  const src = "@diagram graph TD\n!+A[API]\n!+B[DB]\n+A --> B";
  const { events } = parseMmdlog(src, { strict: true });
  const frames = replayTimeline(events);
  assert.equal(frames.length, 1);

  const out = join(tmpdir(), `mmdlog-smoke-silent-${Date.now()}.gif`);
  try {
    await writeGif(frames, out, 2, 320, 240);
    const buf = await readFile(out);
    assert.equal(buf.subarray(0, 6).toString("ascii"), "GIF89a");
  } finally {
    await rm(out, { force: true });
  }
});
