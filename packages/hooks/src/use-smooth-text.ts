import { useEffect, useRef, useState } from "react";

/** The slowest a waiting backlog is revealed, in characters a second. */
export const MIN_CHARS_PER_SECOND = 90;

/** The share of the waiting text revealed per 16ms frame. */
export const CATCH_UP_PER_FRAME = 0.18;

/**
 * At most this often the shown text changes, in milliseconds. Each change
 * re-parses the preview's Markdown, so drawing every 60 or 120 Hz frame would
 * make the parse, not the pacing, what a slow phone notices.
 */
export const REVEAL_EVERY_MS = 33;

/**
 * How many characters of `target` to show after `elapsedMs`, from `shown`.
 * Pure, so the pacing is tested without frames.
 */
export function nextRevealLength(
  shown: number,
  target: number,
  elapsedMs: number,
): number {
  if (shown >= target) return target;
  const frames = Math.max(elapsedMs, 0) / 16;
  const backlog = target - shown;
  const byShare = backlog * (1 - Math.pow(1 - CATCH_UP_PER_FRAME, frames));
  const byFloor = (MIN_CHARS_PER_SECOND * Math.max(elapsedMs, 0)) / 1000;
  const step = Math.max(byShare, byFloor, frames > 0 ? 1 : 0);
  return Math.min(target, shown + Math.ceil(step));
}

/**
 * Where to end a reveal of `length` characters of `text`: forward to the end
 * of the word it falls in, so a frame never shows half a word, half an emoji
 * or a letter without its accent (bar the last word, while it is still
 * arriving), and the reveal never stalls. A run with no break within 24
 * characters (a long link) is cut where it is, stepping past
 * a lone high surrogate.
 */
export function revealCut(text: string, length: number): number {
  if (length <= 0 || length >= text.length) return length;
  const rest = text.slice(length).search(/\s/);
  const end = rest === -1 ? text.length : length + rest;
  if (end - length < 24) return end;
  const code = text.charCodeAt(length - 1);
  return code >= 0xd800 && code <= 0xdbff ? length + 1 : length;
}

/**
 * Paces streamed text so it reads as a steady flow rather than in bursts
 * (Paul, 2026-11-22: Ask on web "not smooth"). The server sends an answer
 * in pieces of whatever size the model and the network give, so drawn as it
 * lands a fast reply shows a paragraph at once and a slow one stalls, then
 * jumps. ChatGPT and Claude buffer what arrives and reveal it a few words at
 * a time; the Vercel AI SDK's `smoothStream` does the same.
 *
 * Each step reveals a share of what is still waiting, never less than
 * `MIN_CHARS_PER_SECOND` allows, so a long backlog is caught up within about
 * a third of a second and a trickle still reads at reading pace, ending on a
 * whole word (`revealCut`). Text that no longer continues what was shown
 * (the preview was cleared, a new turn began) starts over from nothing.
 *
 * With `paced` false (Reduce Motion) the target is returned as it is, and so
 * it is where there are no animation frames.
 */
export function useSmoothText(target: string, paced: boolean): string {
  const [length, setLength] = useState(0);
  const shown = useRef(0);
  const prior = useRef("");
  const hasRaf = typeof requestAnimationFrame === "function";
  const live = paced && hasRaf;

  useEffect(() => {
    if (!live) return;
    // Text that no longer continues what was shown starts over, and so does
    // a preview cleared to "" and begun again.
    if (!target.startsWith(prior.current) || target.length < shown.current) {
      shown.current = 0;
      setLength(0);
    }
    prior.current = target;
    let frame = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      if (last === null) last = now - REVEAL_EVERY_MS;
      const elapsed = now - last;
      if (elapsed >= REVEAL_EVERY_MS) {
        last = now;
        const next = revealCut(
          target,
          nextRevealLength(shown.current, target.length, elapsed),
        );
        if (next > shown.current) {
          shown.current = next;
          setLength(next);
        }
      }
      if (shown.current < target.length) frame = requestAnimationFrame(tick);
    };
    if (shown.current < target.length) frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, live]);

  if (!live) return target;
  return target.slice(0, Math.min(length, target.length));
}
