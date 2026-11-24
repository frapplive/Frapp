"use client";

import { useMemo } from "react";
import { describeLoadFailure } from "@repo/hooks/error-copy";
import {
  formatServiceHours,
  useGeofences,
  usePermissionList,
  useStudySessions,
} from "@repo/hooks";
import { can } from "@repo/validation";
import { formatDayTimeRange, formatMinutesRounded } from "@repo/formatting";
import { Badge } from "@/components/ui/badge";
import { InlineNote } from "@/components/shared/inline-note";
import { NestedError } from "@/components/shared/nested-states";
import { SkeletonRows } from "@/components/shared/page-skeletons";
import { SectionLabel } from "@/components/shared/section-label";
import { denseListClassName } from "@/components/shared/table-controls";
import {
  studySessionStatusKind,
  studySessionStatusLabel,
  type StudySessionStatus,
} from "@/components/study/study-status";
import { useChapterModuleGateState } from "@/lib/hooks/use-chapter-module-gate";
import { asArray } from "@/lib/utils";
import { StandingPanelFrame, StandingStat } from "./standing-panel-frame";

export type StudySession = {
  id: string;
  geofence_id: string;
  status: StudySessionStatus;
  start_time: string;
  end_time: string | null;
  total_foreground_minutes: number;
  points_awarded: boolean;
};

/**
 * The viewer's study sessions, newest first, and the minutes they add up to.
 * `GET /v1/study-sessions` is the caller's own sessions whatever their role
 * (`spec/behavior/study-sessions.md`), so nothing is filtered here.
 */
export function useMyStudySessions(options: { enabled?: boolean } = {}) {
  const query = useStudySessions(options);
  const sessions = useMemo(
    () =>
      asArray<StudySession>(query.data).sort((a, b) =>
        a.start_time < b.start_time ? 1 : -1,
      ),
    [query.data],
  );
  // Ended sessions only, as the server counts study time (`endedStudyMinutes`)
  // and the phone totals its history: a running session's banked minutes
  // join the total when it ends, so Profile never says more than the week
  // gauge beside it. `ACTIVE` (paused or not) is the only status not ended.
  const totalMinutes = useMemo(
    () =>
      sessions.reduce(
        (sum, session) =>
          session.status === "ACTIVE" ||
          !Number.isFinite(session.total_foreground_minutes)
            ? sum
            : sum + session.total_foreground_minutes,
        0,
      ),
    [sessions],
  );
  return { query, sessions, totalMinutes };
}

/**
 * Your study sessions, opened from the Study hours figure on your own Profile
 * (#5950): the hours they add up to, then each session by where it was, when,
 * how long it ran and how it ended.
 *
 * It reads; it starts nothing. A study session runs on the phone, where the
 * location check and the foreground rule can be kept
 * (`spec/behavior/study-sessions.md`), so the web's Study hours page and its
 * Start button are gone. The figure that opens this is drawn only once the
 * member has a session, so the web never shows a study screen with nothing
 * to do on it.
 */
export function MyStudyPanel({ onClose }: { onClose: () => void }) {
  const { query, sessions, totalMinutes } = useMyStudySessions();
  // Zone names, for whoever may read them: the route is guarded by
  // `members:view` and the Study zones module, so the read is held otherwise
  // and a row falls back to "Study session".
  const gate = useChapterModuleGateState();
  const canSeeZones =
    can("members:view", usePermissionList()) &&
    gate.status === "ready" &&
    gate.isModuleEnabled("geofences");
  const zonesQuery = useGeofences({ enabled: canSeeZones });
  const zoneNames = useMemo(
    () =>
      new Map(
        asArray<{ id: string; name: string }>(zonesQuery.data).map((zone) => [
          zone.id,
          zone.name,
        ]),
      ),
    [zonesQuery.data],
  );
  const failed = query.isError && query.data === undefined;

  return (
    <StandingPanelFrame title="Study hours" onClose={onClose}>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-4">
        <StandingStat
          label="All time"
          value={query.isPending || failed ? "–" : formatServiceHours(totalMinutes)}
          detail={query.isPending || failed ? null : "hours"}
        />
      </dl>
      <section aria-labelledby="my-study-sessions" className="space-y-2">
        <SectionLabel
          id="my-study-sessions"
          count={
            sessions.length > 0
              ? `${sessions.length} session${sessions.length === 1 ? "" : "s"}`
              : null
          }
        >
          Sessions
        </SectionLabel>
        {query.isPending ? (
          <div role="status" aria-label="Loading your study sessions">
            <SkeletonRows rows={4} lines={2} trailing={["w-12", "w-20"]} />
          </div>
        ) : failed ? (
          <NestedError
            title="Couldn't load your study sessions"
            description={describeLoadFailure(query.error)}
            onRetry={() => void query.refetch()}
          />
        ) : sessions.length === 0 ? (
          <InlineNote>No study sessions yet.</InlineNote>
        ) : (
          <ul role="list" className={denseListClassName}>
            {sessions.map((session) => {
              // A session still running has no end, and reads as its start.
              const when = formatDayTimeRange(
                session.start_time,
                session.end_time,
              );
              return (
                <li
                  key={session.id}
                  className="flex min-h-11 flex-col gap-1 py-2 @md:flex-row @md:items-center @md:justify-between @md:gap-3"
                >
                  {/* Where, then when, then how long, as the phone's row
                      reads: the zone is what a member remembers a session
                      by. */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {zoneNames.get(session.geofence_id) ?? "Study session"}
                    </p>
                    {when ? (
                      <p className="text-caption text-muted-foreground">
                        {when}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums">
                      {formatMinutesRounded(session.total_foreground_minutes)}
                    </span>
                    <Badge variant={studySessionStatusKind(session.status)}>
                      {studySessionStatusLabel(session.status)}
                    </Badge>
                    {session.points_awarded ? (
                      <Badge variant="outline">Points awarded</Badge>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </StandingPanelFrame>
  );
}
