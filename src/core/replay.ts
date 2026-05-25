import { emitMermaid } from "./emitter.js";
import { reducePrefixes } from "./reducer.js";
import type { MerlogEvent, ReplayFrame } from "./types.js";

export function replayTimeline(events: readonly MerlogEvent[]): ReplayFrame[] {
  const states = reducePrefixes(events);
  const frames: ReplayFrame[] = [];
  for (let i = 0; i < events.length; i += 1) {
    if (events[i].silent) continue;
    frames.push({
      step: i + 1,
      event: events[i],
      state: states[i],
      mermaid: emitMermaid(states[i])
    });
  }
  return frames;
}
