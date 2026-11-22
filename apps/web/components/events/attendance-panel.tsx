"use client";

import { describeLoadFailure } from "@repo/hooks/error-copy";
import { useMemo, useState } from "react";
import { Loader2, Search, UserX } from "lucide-react";
import {
  ATTENDANCE_SEARCH_FROM,
  EVENT_PAGE_COPY,
  eventInvitees,
  type EventAttendanceFields,
  type EventPagePhase,
} from "@repo/validation";
import {
  eventRosterCounts,
  eventRosterMarks,
  eventRosterRows,
  eventRosterStatusText,
  eventRosterTally,
  orderEventRoster,
  useAttendance,
  useAutoAbsent,
  useMarkEventRosterRow,
  useMembers,
  type EventRosterRow,
} from "@repo/hooks";
import { Badge, type BadgeKind } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedChoice } from "@/components/ui/segmented";
import { NestedError, NestedLoading } from "@/components/shared/nested-states";
import {
  SubscriptionNotice,
  useSubscriptionGate,
} from "@/components/shared/subscription-gate";
import { toastFailure } from "@/lib/failure-toast";
import { useToast } from "@/lib/hooks/use-toast";
import { asArray, cn, getErrorMessage } from "@/lib/utils";
import { Can } from "@/components/shared/can";
import {
  attendanceStatusKind,
  attendanceStatusLabel,
} from "@/components/events/attendance-status";
import type { AttendanceStatus } from "@/components/events/attendance-status";
import { checkInLabel } from "@/components/events/event-labels";
import { InlineNote } from "@/components/shared/inline-note";

/** The roster's view: everyone, those who came (present or late), the rest. */
type AttendanceFilter = "ALL" | "IN" | "OUT";

type AttendanceRow = {
  id?: string;
  event_id?: string;
  user_id?: string;
  status?: AttendanceStatus;
  check_in_time?: string | null;
  excuse_reason?: string | null;
};

export function AttendancePanel({
  eventId,
  eventStart,
  audience,
  phase = "live",
}: {
  eventId: string;
  /**
   * Who the event invites, by role. The roster is those members, plus anyone
   * with a row the rule wouldn't list (a member whose roles changed since),
   * so its count is the page's "15 people", not the whole chapter.
   */
  audience?: EventAttendanceFields;
  /** Live while check-in is open, past after: the words and the bulk action. */
  phase?: Exclude<EventPagePhase, "upcoming">;
  /**
   * The event's `start_time`, so a check-in on the event's own day reads as a
   * time alone ("Checked in 5:03 PM") and one on another day names the day.
   */
  eventStart?: unknown;
}) {
  const { toast } = useToast();
  const attendanceQuery = useAttendance(eventId);
  const membersQuery = useMembers();
  const markRow = useMarkEventRosterRow(eventId);
  const autoAbsent = useAutoAbsent();
  // `PATCH /v1/events/:eventId/attendance/:userId` and the auto-absent POST
  // carry no `@FreeTier`, so both are paid-ops and mirror the gate (#841).
  // Reading attendance stays live — `enforceSubscription` returns early for
  // GET, so a lapsed chapter can still see who showed up.
  const gate = useSubscriptionGate();
  // Auto-absent is refused until check-in closes, which is when the page
  // turns past, so the button is only offered then (`eventPagePhase`).
  const autoAbsentControlProps = gate.controlProps(autoAbsent.isPending);

  const [statusFilter, setStatusFilter] = useState<AttendanceFilter>("ALL");
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();

  // Live updates come from the event sheet, which holds the one
  // `attendance:<eventId>` subscription for every viewer (a topic takes one
  // channel, so a second here would release the sheet's), and invalidates
  // this roster with the member's own row.

  const attendance = useMemo(
    () => asArray<AttendanceRow>(attendanceQuery.data),
    [attendanceQuery.data],
  );
  const members = useMemo(() => {
    const all = (membersQuery.data ?? []).filter((member) => !!member.user_id);
    return audience ? eventInvitees(audience, all) : all;
  }, [membersQuery.data, audience]);

  // An answer just clicked shows lit at once, before the roster reads it
  // back, so a run of clicks down the list doesn't flicker; a refused one
  // goes back with its toast. Each new read of the roster replaces the
  // answers whose writes have finished; one still being sent stays, since
  // the read the first write asked for can land before the second is saved.
  const [marked, setMarked] = useState<Record<string, AttendanceStatus>>({});
  const [sending, setSending] = useState<Record<string, number>>({});
  const [markedAt, setMarkedAt] = useState(attendanceQuery.dataUpdatedAt);
  if (markedAt !== attendanceQuery.dataUpdatedAt) {
    setMarkedAt(attendanceQuery.dataUpdatedAt);
    setMarked((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([userId]) => sending[userId]),
      ),
    );
  }

  const rows = useMemo(
    () => eventRosterRows(members, attendance, marked),
    [attendance, members, marked],
  );

  // After the event, who didn't come reads first: it's what an exec checks
  // the day after. During it, the list keeps name order, so rows don't jump
  // as people check in.
  const ordered = orderEventRoster(rows, phase);
  const filteredRows = ordered.filter(
    (row) =>
      (statusFilter === "ALL"
        ? true
        : statusFilter === "IN"
          ? row.status === "PRESENT" || row.status === "LATE"
          : row.status !== "PRESENT" && row.status !== "LATE") &&
      (!needle ||
        row.displayName.toLowerCase().includes(needle) ||
        row.email.toLowerCase().includes(needle)),
  );

  async function changeStatus(row: EventRosterRow, next: AttendanceStatus) {
    const { userId } = row;
    setMarked((current) => ({ ...current, [userId]: next }));
    const sent = (by: number) =>
      setSending((current) => {
        const count = (current[userId] ?? 0) + by;
        const rest = { ...current };
        if (count > 0) rest[userId] = count;
        else delete rest[userId];
        return rest;
      });
    sent(1);
    try {
      await markRow(row, next);
    } catch (error) {
      setMarked((current) => {
        const rest = { ...current };
        delete rest[userId];
        return rest;
      });
      toast({
        title: "Couldn't update attendance",
        description: getErrorMessage(
          error,
          "Retry in a moment. Your change hasn't been saved.",
        ),
        variant: "destructive",
      });
    } finally {
      sent(-1);
    }
  }

  async function runAutoAbsent() {
    try {
      await autoAbsent.mutateAsync(eventId);
      toast({
        title: "Auto-absent marking complete",
        description:
          "Members required to attend who weren't checked in or excused are now marked absent.",
      });
    } catch (error) {
      toastFailure({
        title: "Couldn't run auto-absent",
        error,
        fallback: "Try again in a moment.",
        retry: runAutoAbsent,
      });
    }
  }

  /*
   * `isPending`, not `isLoading`. `isLoading` is `isPending && isFetching`, and
   * `isFetching` is false while a query is *disabled* — `useMembers` is
   * `enabled: !!chapterId` (`packages/hooks/src/use-members.ts`). So an
   * unresolved chapter read as "not loading" on both flags, `membersQuery`
   * was not errored either (merely disabled), and the panel fell through to
   * "No attendance records yet": the same false-empty the roster branch below
   * exists to prevent, reached by another door. README §4's warning about
   * `isPending` on a disabled query is about spinning forever; here the roster
   * is genuinely not available yet, and claiming nobody checked in is worse.
   */
  if (attendanceQuery.isPending || membersQuery.isPending) {
    return (
      <div role="status" aria-live="polite" aria-busy="true">
        <NestedLoading message="Loading attendance..." />
      </div>
    );
  }

  if (attendanceQuery.isError) {
    return (
      <div role="status" aria-live="polite">
        <NestedError
          title="Attendance unavailable"
          description={`Couldn't load attendance for this event. ${describeLoadFailure(attendanceQuery.error)}`}
          onRetry={() => void attendanceQuery.refetch()}
        />
      </div>
    );
  }

  /*
   * The roster is the other half of every row, and its failure used to be
   * silent: `rows` is built from `members`, so a failed `useMembers` produced
   * an empty list and the panel rendered "No attendance records yet" — copy
   * asserting that nobody has checked in, at the one moment we cannot know.
   * README §4 wants an error with a retry path, and this is one.
   */
  if (membersQuery.isError) {
    return (
      <div role="status" aria-live="polite">
        <NestedError
          title="Attendance unavailable"
          description="Couldn't load the chapter roster, so attendance can't be shown against it. Retry in a moment."
          onRetry={() => void membersQuery.refetch()}
        />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div role="status" aria-live="polite">
        <InlineNote>No attendance recorded yet.</InlineNote>
      </div>
    );
  }

  const counts = eventRosterCounts(rows);
  // The per-row write is gated as the bulk one is, with the same notice.
  const rowGate = gate.controlProps() as {
    disabled?: boolean;
    "aria-describedby"?: string;
  };
  const here = counts.PRESENT + counts.LATE;
  const filters: { value: AttendanceFilter; label: string }[] = [
    { value: "ALL", label: EVENT_PAGE_COPY.filterAll },
    { value: "IN", label: EVENT_PAGE_COPY.filterHere(phase) },
    { value: "OUT", label: EVENT_PAGE_COPY.filterNotHere(phase) },
  ];
  // The counts as one muted line, the states that have someone in them.
  const tally = eventRosterTally(counts, phase);

  /*
    The roster takes the side list once check-in opens (Paul 2026-11-22: a
    month early it was the biggest thing on the page and nothing on it could
    be marked). Check-ins fill it; a hand mark is the exception, so each
    person carries one status chip that opens the four answers (Paul's pick
    2026-11-22), not four buttons a row: 600 buttons at 150 members. It is
    web's value picker, `Select` (rulebook § 9), so it shows the answer it
    holds. Meetup's and Luma's host lists set attendance out the same way,
    one status per guest. The three views split who came from who didn't,
    the two sets an exec reads during and after.
  */
  return (
    <section aria-label="Attendance" className="grid gap-3">
      <div className="grid gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Attendance</h3>
          <span className="text-caption text-muted-foreground">
            {phase === "past"
              ? EVENT_PAGE_COPY.came(here, rows.length)
              : EVENT_PAGE_COPY.checkedIn(here, rows.length)}
          </span>
        </div>
        {tally.length > 0 ? (
          <p className="text-caption text-muted-foreground">
            {tally.map((entry, index) => (
              <span key={entry.label}>
                {index > 0 ? " · " : null}
                <span className="font-semibold text-foreground">
                  {entry.count}
                </span>{" "}
                {entry.label}
              </span>
            ))}
          </p>
        ) : null}
      </div>
      {/* Not gated: filtering is a read, and §5 gates writes only. */}
      <SegmentedChoice
        label="Show"
        options={filters}
        value={statusFilter}
        onChange={setStatusFilter}
        dense
        fill
      />
      {rows.length >= ATTENDANCE_SEARCH_FROM ? (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a member"
            aria-label="Find a member"
            className="pl-8"
          />
        </div>
      ) : null}
      {/*
        Disable, don't hide (§5 rule 4): the roster, the counts, and the
        filter keep working for a lapsed chapter; only recording attendance
        stops, and this says why.
      */}
      <Can permission="events:update" offlineFallback={null}>
        <SubscriptionNotice gate={gate} feature="managing events" />
      </Can>
      {filteredRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {needle ? "No member matches that." : "Nobody here."}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {filteredRows.map((row) => {
            const checkedIn =
              row.status === "PRESENT" || row.status === "LATE"
                ? checkInLabel(row.checkInTime, eventStart)
                : null;
            const note =
              checkedIn ??
              (row.status === "EXCUSED" && row.excuseReason
                ? row.excuseReason
                : null);
            const statusText = eventRosterStatusText(row.status, phase);
            return (
              <li
                key={row.userId}
                className="flex min-h-11 min-w-0 items-center gap-2 py-1"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-semibold"
                    title={row.email || undefined}
                  >
                    {row.displayName}
                  </p>
                  {note ? (
                    <p className="truncate text-caption text-muted-foreground">
                      {note}
                    </p>
                  ) : null}
                </div>
                <Can
                  permission="events:update"
                  deniedFallback={
                    <Badge variant={attendanceStatusKind(row.status)}>
                      {statusText}
                    </Badge>
                  }
                >
                  {/*
                    The per-row write hits the same guard as the bulk action,
                    so it is gated too, disabled rather than hidden.
                  */}
                  <Select
                    value={row.status === "UNRECORDED" ? "" : row.status}
                    disabled={rowGate.disabled}
                    onValueChange={(next) =>
                      void changeStatus(row, next as AttendanceStatus)
                    }
                  >
                    <SelectTrigger
                      aria-label={`Attendance for ${row.displayName}: ${statusText}`}
                      aria-describedby={rowGate["aria-describedby"]}
                      className={cn(
                        "h-7 w-auto shrink-0 gap-1 rounded-md border-border bg-transparent px-2 text-caption pointer-coarse:h-11",
                        STATUS_TEXT[attendanceStatusKind(row.status)],
                      )}
                    >
                      <span>{statusText}</span>
                    </SelectTrigger>
                    <SelectContent align="end">
                      {eventRosterMarks(row).map((status) => (
                        <SelectItem key={status} value={status}>
                          {attendanceStatusLabel(status)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Can>
              </li>
            );
          })}
        </ul>
      )}
      {phase === "past" ? (
        <Can permission="events:update">
          <div className="grid gap-1 border-t border-border pt-3">
            <Button
              variant="secondary"
              size="sm"
              className="justify-self-start"
              {...autoAbsentControlProps}
              onClick={runAutoAbsent}
            >
              {autoAbsent.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <UserX className="h-4 w-4" aria-hidden="true" />
              )}
              Mark no-shows absent
            </Button>
            <p className="text-caption text-muted-foreground">
              Members this event requires who didn&apos;t check in and
              aren&apos;t excused.
            </p>
          </div>
        </Can>
      ) : null}
    </section>
  );
}

/** A status chip's text colour, by the badge kind that states it. */
const STATUS_TEXT: Partial<Record<BadgeKind, string>> = {
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive-text",
};
