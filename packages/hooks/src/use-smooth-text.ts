import { useEffect, useRef, useState } from "react";

/**
 * Paces streamed text so it reads as a steady flow rather than in bursts
 * (Paul, 2026-11-22: Ask on web "not smooth"). The server sends an answer
 * in pieces of whatever size the model and the network give, so drawn as it
 * lands a fast reply shows a paragraph at once and a slow one stalls, then
 * jumps. ChatGPT and Claude buffer what arrives and reveal it a few
 * characters a frame; the Vercel AI SDK's `smoothStream` does the same.
 *
 * Each frame reveals a share of what is still waiting, never less than
 * `MIN_CHARS_PER_SECOND` allows, so a long backlog is caught up within about
 * a third of a second and a trickle still reads at reading pace. Text that
 * no longer continues what was shown (the preview was cleared, a new turn
 * began) starts over from nothing.
 *
 * With `paced` false (Reduce Motion, or a caller that wants the raw text)
 * the target is returned as it is.
 */
export const MIN_CHARS_PER_SECOND = 90;

/** The share of the waiting text revealed per 16ms frame. */
export const CATCH_UP_PER_FRAME = 0.18;

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
 * Never end a reveal inside a surrogate pair, which would draw half an
 * emoji or accented letter for a frame.
 */
function safeCut(text: string, length: number): number {
  if (length <= 0 || length >= text.length) return length;
  const code = text.charCodeAt(length - 1);
  return code >= 0xd800 && code <= 0xdbff ? length + 1 : length;
}

export function useSmoothText(target: string, paced: boolean): string {
  const [length, setLength] = useState(0);
  const shown = useRef(0);
  const prior = useRef("");
  const hasRaf = typeof requestAnimationFrame === "function";
  const live = paced && hasRaf;

  useEffect(() => {
    if (!live) return;
    // Text that no longer continues what was shown starts over.
    // A preview cleared to "" and begun again is one too.
    if (!target.startsWith(prior.current) || target.length < shown.current) {
      shown.current = 0;
      setLength(0);
    }
    prior.current = target;
    let frame = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      const elapsed = last === null ? 16 : now - last;
      last = now;
      const next = safeCut(
        target,
        nextRevealLength(shown.current, target.length, elapsed),
      );
      if (next !== shown.current) {
        shown.current = next;
        setLength(next);
      }
      if (next < target.length) frame = requestAnimationFrame(tick);
    };
    if (shown.current < target.length) frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, live]);

  if (!live) return target;
  return target.slice(0, Math.min(length, target.length));
}
