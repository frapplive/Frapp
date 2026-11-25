"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  formatServiceHours,
  profileStatsErrorNote,
  useMyProfileStats,
} from "@repo/hooks";
import { SectionLabel } from "@/components/shared/section-label";
import { FOCUS_RING } from "@/components/ui/focus";
import { useChapterModuleGateState } from "@/lib/hooks/use-chapter-module-gate";
import { cn } from "@/lib/utils";
import { useMyStudySessions } from "./my-study-panel";
import { standingHref, type StandingDoor } from "./standing-doors";

type Cell = {
  door: StandingDoor;
  label: string;
  /** The figure, or `null` for a read that failed ("–", never a zero). */
  value: string | null;
  /** What pressing it opens, for a screen reader. */
  opens: string;
};

/**
 * Your numbers on your own Profile, each a door (#5950): Points, Service
 * hours and Study hours, all time, in one ruled frame like This semester's
 * gauges under it. Pressing one opens what is behind the number, docked in
 * place: your point history, your service log with Log hours, your study
 * sessions. They were three sidebar pages until then.
 *
 * A module the chapter has off draws no cell and sends no read: its figure is
 * hidden, never shown as a zero (P5.8). Service hours stays at zero, since
 * its panel is where the first hours are logged. Study hours appears once the
 * member has a session: a session starts on the phone, so before then the
 * web has nothing to show or do for it.
 */
export function StandingStats() {
  const gate = useChapterModuleGateState();
  // On while the chapter's modules are first read, so nothing vanishes on a
  // slow read; closed once that read failed or can't run (the gate's own
  // rule), so a chapter with a module off never shows its figure (P5.8).
  const moduleOn = (key: string) =>
    gate.status === "ready"
      ? gate.isModuleEnabled(key)
      : gate.status === "loading";
  const pointsOn = moduleOn("points");
  const hoursOn = moduleOn("hours");
  const stats = useMyProfileStats({ points: pointsOn, service: hoursOn });
  const study = useMyStudySessions({
    enabled: hoursOn && gate.status === "ready" && stats.hasChapter,
  });

  if (!stats.visible) return null;

  const cells: Cell[] = [];
  if (pointsOn) {
    cells.push({
      door: "points",
      label: "Points",
      value: stats.points === null ? null : stats.points.toLocaleString(),
      opens: "your point history",
    });
  }
  if (hoursOn) {
    cells.push({
      door: "service",
      label: "Service hours",
      value: stats.serviceHours,
      opens: "your service log",
    });
  }
  if (hoursOn && study.sessions.length > 0) {
    cells.push({
      door: "study",
      label: "Study hours",
      value: formatServiceHours(study.totalMinutes),
      opens: "your study sessions",
    });
  }
  if (cells.length === 0) return null;

  const note = !stats.hasChapter
    ? "Choose a chapter to see your points."
    : profileStatsErrorNote(
        pointsOn && stats.pointsFailed,
        hoursOn && stats.serviceFailed,
      );

  return (
    <section aria-labelledby="profile-standing-all-time" className="space-y-2">
      <SectionLabel id="profile-standing-all-time">All time</SectionLabel>
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-px overflow-hidden rounded-xl border border-border bg-border">
        {cells.map((cell) => (
          <li key={cell.door} className="bg-card">
            <Link
              href={standingHref(cell.door)}
              scroll={false}
              aria-label={`${cell.label}: ${cell.value ?? "couldn't load"}. Opens ${cell.opens}.`}
              data-testid={`profile-standing-${cell.door}`}
              className={cn(
                "flex h-full min-h-16 flex-col justify-center gap-0.5 px-4 py-3 transition-colors hover:bg-card-hover",
                // Inset: the frame clips an outer ring at its rounded edge.
                FOCUS_RING,
                "focus-visible:ring-inset",
              )}
            >
              <span className="flex items-center justify-between gap-2 text-caption text-muted-foreground">
                <span className="truncate">{cell.label}</span>
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                />
              </span>
              <span
                className={cn(
                  "text-headline font-bold tabular-nums",
                  cell.value === null
                    ? "text-muted-foreground"
                    : "text-foreground",
                )}
              >
                {cell.value ?? "–"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {note ? (
        <p className="text-caption text-muted-foreground">{note}</p>
      ) : null}
    </section>
  );
}
