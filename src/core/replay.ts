import { emitMermaid, emitMermaidWithDelta, emitMermaidWithRemoval } from "./emitter.js";
import { reducePrefixes } from "./reducer.js";
import type { CoreState, MmdlogEvent, ReplayFrame } from "./types.js";

export interface ReplayOptions {
  /** Tint newly-added elements (graph only). */
  highlight?: boolean;
  /** Split each delta step into a brief highlighted frame + a settled plain frame. Animation-only (gif); ignored without `highlight`. */
  flash?: boolean;
}

export function replayTimeline(events: readonly MmdlogEvent[], options: ReplayOptions = {}): ReplayFrame[] {
  const states = reducePrefixes(events);
  const frames: ReplayFrame[] = [];
  let prev: CoreState | null = null;
  for (let i = 0; i < events.length; i += 1) {
    if (events[i].silent) continue;
    const state = states[i];
    const plain = emitMermaid(state);
    const base = { step: i + 1, event: events[i], state };

    if (!options.highlight) {
      frames.push({ ...base, mermaid: plain });
      prev = state;
      continue;
    }

    const added = emitMermaidWithDelta(state, prev);
    const hasAdd = added !== plain;

    if (!options.flash) {
      // Static frames: tint additions in place; removals show the plain post-removal state.
      frames.push({ ...base, mermaid: hasAdd ? added : plain });
      prev = state;
      continue;
    }

    // Animated flash: a brief tinted frame, then the settled plain frame.
    if (hasAdd) {
      frames.push({ ...base, mermaid: added, flash: true });
    } else if (prev) {
      const removed = emitMermaidWithRemoval(prev, state);
      if (removed !== emitMermaid(prev)) {
        frames.push({ ...base, mermaid: removed, flash: true });
      }
    }
    frames.push({ ...base, mermaid: plain });
    prev = state;
  }
  return frames;
}
