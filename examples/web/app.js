import mermaid from "mermaid";
import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { Canvg } from "canvg";
import { parseMmdlog, replayTimeline } from "../../dist/core/index.js";

const Prism = window.Prism;

if (!Prism.languages.mermaid) {
  throw new Error("Prism mermaid component failed to load");
}

Prism.languages.mmdlog = Prism.languages.extend("mermaid", {
  comment: { pattern: /#.*/, greedy: true }
});

Prism.languages.insertBefore("mmdlog", "comment", {
  silent: { pattern: /^!/m, alias: "important" },
  directive: { pattern: /^@diagram\b/m, alias: "keyword" },
  prefix: { pattern: /^[+\-]/m, alias: "operator" },
  "mmdlog-keyword": {
    pattern: /\b(?:member|attr|actor|entity|section|title|dateFormat|axisFormat|commit|branch|checkout|merge|TD|LR|BT|RL)\b/,
    alias: "keyword"
  },
  "mmdlog-id-upper": {
    pattern: /\b[A-Z][A-Za-z0-9_-]*\b/,
    alias: "class-name"
  }
});

function highlightWith(lang, code) {
  return Prism.highlight(code, Prism.languages[lang], lang);
}

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "loose",
  deterministicIds: true,
  theme: "default",
  htmlLabels: false,
  flowchart: { useMaxWidth: false, htmlLabels: false },
  class: { useMaxWidth: false, htmlLabels: false },
  state: { useMaxWidth: false, htmlLabels: false },
  sequence: { useMaxWidth: false },
  gantt: { useMaxWidth: false },
  er: { useMaxWidth: false },
  journey: { useMaxWidth: false },
  pie: { useMaxWidth: false },
  gitGraph: { useMaxWidth: false }
});

const EXAMPLE_NAMES = [
  "basic",
  "sequence",
  "class",
  "state",
  "er",
  "journey",
  "gantt",
  "pie",
  "gitgraph",
  "silent",
  "raw",
  "complex-topology"
];

const $ = (id) => document.getElementById(id);
const input = $("input");
const examples = $("examples");
const status = $("status");
const warnings = $("warnings");
const preview = $("preview");
const download = $("download");
const runBtn = $("run");

function populateExamples() {
  for (const name of EXAMPLE_NAMES) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    examples.appendChild(opt);
  }
  examples.addEventListener("change", loadExample);
  examples.value = "basic";
  loadExample();
}

async function loadExample() {
  const res = await fetch(`../${examples.value}.mmdlog`);
  input.value = await res.text();
  syncInputHighlight();
  warnings.innerHTML = "";
  stopPlayback();
  download.style.display = "none";
}

function syncInputHighlight() {
  const hl = $("input-highlight");
  if (!hl) return;
  hl.innerHTML = highlightWith("mmdlog", input.value);
  hl.scrollTop = input.scrollTop;
  hl.scrollLeft = input.scrollLeft;
}

let playbackTimer = null;
let playbackFrames = [];
let playbackIndex = 0;

function stopPlayback() {
  if (playbackTimer) {
    clearTimeout(playbackTimer);
    playbackTimer = null;
  }
  playbackFrames = [];
  playbackIndex = 0;
  const ctx = preview.getContext("2d");
  if (ctx) ctx.clearRect(0, 0, preview.width, preview.height);
  $("frame-mermaid").textContent = "";
  $("frame-label").textContent = "";
}

function startPlayback(infos) {
  stopPlayback();
  if (infos.length === 0) return;
  playbackFrames = infos;
  preview.width = infos[0].imageData.width;
  preview.height = infos[0].imageData.height;
  const ctx = preview.getContext("2d");
  const tick = () => {
    const info = playbackFrames[playbackIndex];
    ctx.putImageData(info.imageData, 0, 0);
    $("frame-mermaid").innerHTML = highlightWith("mmdlog", info.mermaid);
    $("frame-label").textContent = `frame ${playbackIndex + 1} / ${playbackFrames.length} · ${info.delayMs}ms · step ${info.step} (line ${info.line})`;
    playbackIndex = (playbackIndex + 1) % playbackFrames.length;
    playbackTimer = setTimeout(tick, info.delayMs);
  };
  tick();
}

function readSvgViewport(svg) {
  const m = svg.match(/viewBox="([\d.\-eE]+)\s+([\d.\-eE]+)\s+([\d.\-eE]+)\s+([\d.\-eE]+)"/);
  if (m) {
    const w = parseFloat(m[3]);
    const h = parseFloat(m[4]);
    if (w > 0 && h > 0) return { w, h };
  }
  const wm = svg.match(/<svg[^>]*\bwidth="(\d+(?:\.\d+)?)(?:px)?"/);
  const hm = svg.match(/<svg[^>]*\bheight="(\d+(?:\.\d+)?)(?:px)?"/);
  if (wm && hm) return { w: parseFloat(wm[1]), h: parseFloat(hm[1]) };
  return { w: 800, h: 600 };
}

async function svgToRgbaCanvg(svg, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);

  const { w: vw, h: vh } = readSvgViewport(svg);
  const scale = Math.min(width / vw, height / vh);
  const drawW = vw * scale;
  const drawH = vh * scale;
  const offX = (width - drawW) / 2;
  const offY = (height - drawH) / 2;

  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);
  const v = await Canvg.fromString(ctx, svg, {
    ignoreMouse: true,
    ignoreAnimation: true,
    ignoreDimensions: true,
    ignoreClear: true
  });
  v.resize(vw, vh);
  await v.render();
  ctx.restore();

  return ctx.getImageData(0, 0, width, height).data;
}

async function svgToRgbaImage(svg, width, height) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("image load failed"));
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);
    const iw = img.naturalWidth || img.width || width;
    const ih = img.naturalHeight || img.height || height;
    const scale = Math.min(width / iw, height / ih);
    const drawW = iw * scale;
    const drawH = ih * scale;
    ctx.drawImage(img, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
    return ctx.getImageData(0, 0, width, height).data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

let imagePathBroken = false;

async function svgToRgba(svg, width, height) {
  if (!imagePathBroken) {
    try {
      return await svgToRgbaImage(svg, width, height);
    } catch (err) {
      if (/tainted|cross-origin|SecurityError/i.test(err.message)) {
        imagePathBroken = true;
      } else {
        throw err;
      }
    }
  }
  return await svgToRgbaCanvg(svg, width, height);
}

function appendWarning(text) {
  const div = document.createElement("div");
  div.className = "warn";
  div.textContent = text;
  warnings.appendChild(div);
}

function blankFrame(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 255;
    data[i * 4 + 1] = 255;
    data[i * 4 + 2] = 255;
    data[i * 4 + 3] = 255;
  }
  return data;
}

function isBodyEmpty(code) {
  const lines = code.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.length <= 1;
}

function isInvisibleFrame(frame) {
  return isBodyEmpty(frame.mermaid);
}

function collapseConsecutive(frames) {
  const out = [];
  let prev = null;
  for (const f of frames) {
    if (f.mermaid === prev) continue;
    out.push(f);
    prev = f.mermaid;
  }
  return out;
}

function writeFrameFromRgba(gif, rgba, width, height, delayMs) {
  const data = new Uint8Array(rgba.buffer ?? rgba);
  const palette = quantize(data, 256);
  const indexed = applyPalette(data, palette);
  gif.writeFrame(indexed, width, height, { palette, delay: delayMs });
}

let renderId = 0;

async function generate() {
  runBtn.disabled = true;
  warnings.innerHTML = "";
  stopPlayback();
  download.style.display = "none";
  status.textContent = "parsing...";

  const width = Math.max(100, +$("width").value || 800);
  const height = Math.max(100, +$("height").value || 450);
  const fps = Math.max(0.2, +$("fps").value || 2);
  const delayMs = Math.max(20, Math.round(1000 / fps));

  const collapse = $("collapse") ? $("collapse").checked : true;
  const highlight = $("highlight") ? $("highlight").checked : false;
  const holdMs = Math.max(0, +($("holdMs")?.value ?? 0));
  const flashMs = Math.max(20, +($("flashMs")?.value ?? 150));

  try {
    const { events, warnings: parseWarnings } = parseMmdlog(input.value, { strict: false });
    for (const w of parseWarnings) appendWarning(w);
    let frames = replayTimeline(events, { highlight, flash: highlight });
    if (collapse) frames = collapseConsecutive(frames);

    if (frames.length === 0) {
      status.textContent = "no frames to render";
      return;
    }

    const gif = GIFEncoder();
    let previousRgba = null;
    const playbackInfos = [];

    for (let i = 0; i < frames.length; i++) {
      status.textContent = `rendering ${i + 1} / ${frames.length}...`;
      await new Promise((r) => requestAnimationFrame(r));

      if (isInvisibleFrame(frames[i])) continue;
      const isLast = i === frames.length - 1;
      const frameDelay = frames[i].flash
        ? flashMs
        : isLast && holdMs > 0
          ? Math.max(holdMs, delayMs)
          : delayMs;

      let svg;
      try {
        const result = await mermaid.render(`mmdlog-${++renderId}`, frames[i].mermaid);
        svg = result.svg;
      } catch (err) {
        appendWarning(`frame ${i + 1} (line ${frames[i].event.line}): ${err.message}`);
        const fallback = previousRgba ?? blankFrame(width, height);
        writeFrameFromRgba(gif, fallback, width, height, frameDelay);
        playbackInfos.push({
          mermaid: frames[i].mermaid,
          imageData: new ImageData(new Uint8ClampedArray(fallback), width, height),
          delayMs: frameDelay,
          step: frames[i].step,
          line: frames[i].event.line
        });
        continue;
      }

      try {
        const rgba = await svgToRgba(svg, width, height);
        writeFrameFromRgba(gif, rgba, width, height, frameDelay);
        previousRgba = rgba;
        playbackInfos.push({
          mermaid: frames[i].mermaid,
          imageData: new ImageData(new Uint8ClampedArray(rgba), width, height),
          delayMs: frameDelay,
          step: frames[i].step,
          line: frames[i].event.line
        });
      } catch (err) {
        appendWarning(`frame ${i + 1} rasterize failed: ${err.message}`);
        const fallback = previousRgba ?? blankFrame(width, height);
        writeFrameFromRgba(gif, fallback, width, height, frameDelay);
        playbackInfos.push({
          mermaid: frames[i].mermaid,
          imageData: new ImageData(new Uint8ClampedArray(fallback), width, height),
          delayMs: frameDelay,
          step: frames[i].step,
          line: frames[i].event.line
        });
      }
    }

    gif.finish();
    const bytes = gif.bytes();
    const blob = new Blob([bytes], { type: "image/gif" });
    const url = URL.createObjectURL(blob);
    download.href = url;
    download.style.display = "inline";
    startPlayback(playbackInfos);
    status.textContent = `done — ${playbackInfos.length} frame(s), ${(bytes.length / 1024).toFixed(1)} KB · canvas playback synced with mermaid source`;
  } catch (err) {
    status.textContent = `error: ${err.message}`;
  } finally {
    runBtn.disabled = false;
  }
}

runBtn.addEventListener("click", generate);
input.addEventListener("input", syncInputHighlight);
input.addEventListener("scroll", () => {
  const hl = $("input-highlight");
  if (!hl) return;
  hl.scrollTop = input.scrollTop;
  hl.scrollLeft = input.scrollLeft;
});
populateExamples();
