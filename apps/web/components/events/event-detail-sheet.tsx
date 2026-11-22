"use client";

import { EventNowPill } from "./now-card";
import {
  agendaCheckOffOpen,
  can,
  checkInZoneLine,
  describeAttendance,
  EVENT_FORM_ROW_LABELS,
  EVENT_PAGE_COPY,
  eventPagePhase,
  deleteOffersSeriesChoice,
  readEventAgenda,
  readEventAttachments,
  SERIES_SCOPE_COPY,
} from "@repo/validation";
import type React from "react";
import { useMemo } from "react";
import type { EventFormGlyphName } from "@repo/theme/event-form-glyphs";
import { EventFormGlyph } from "@/components/events/event-form-rows";
import { AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ActionMenuButton } from "@/components/shared/row-menu";
import { EventPeople } from "@/components/events/event-people";
import { SectionSkeleton } from "@/components/shared/page-skeletons";
import { SkeletonText } from "@/components/shared/async-states";
import {
  useActiveChapterId,
  useDeleteEvent,
  useEvent,
  useEventInvitees,
  useMyPermissions,
  useRequiredOfViewer,
  useRoles,
  useViewerUserId,
  useNow,
} from "@repo/hooks";
import { statusOf } from "@repo/api-sdk";
import { useRealtimeTable } from "@/lib/realtime/use-realtime-table";
import { useNetwork } from "@/lib/providers/network-provider";
import { useRefetchAfterOutage } from "@/lib/hooks/use-refetch-after-outage";
import { toastFailure } from "@/lib/failure-toast";
import { useToast } from "@/lib/hooks/use-toast";
import { attendanceFieldsOf, attendanceFromEvent } from "@repo/validation";
import { IconButton } from "@/components/ui/icon-button";
import {
  SubscriptionNotice,
  useSubscriptionGate,
} from "@/components/shared/subscription-gate";
import {
  Panel,
  PanelBody,
  PanelContent,
  PanelHeader,
} from "@/components/shared/panel";
import { AttendancePanel } from "@/components/events/attendance-panel";
import { checkInZoneState, MyCheckIn } from "@/components/events/my-check-in";
import { ExcuseReview, MyExcuse } from "@/components/events/event-excuses";
import { EventMeetingLists } from "@/components/events/event-agenda";
import { useChapterModuleGateState } from "@/lib/hooks/use-chapter-module-gate";
import { Can } from "@/components/shared/can";
import { PermissionsOfflineSurface } from "@/components/shared/async-states";
import { toRoleOptions } from "@repo/hooks/chapter-roles";
import { formatDayTime, formatDayTimeRange } from "@repo/formatting";
import { pointsLabel, recurrenceLabel } from "@/components/events/event-labels";
import { EVENT_HUE } from "@/components/events/event-kind";
import { cn } from "@/lib/utils";
import { FOCUS_RING_OFFSET } from "@/components/ui/focus";
import { useConfirmDialog } from "@/components/shared/confirm-dialog";
import { editTargetOf } from "@/components/events/edit-target";
import {
  EventMinutes,
  useMeetingsModuleOn,
} from "@/components/meetings/event-minutes";

type EventRecord = Record<string, unknown>;

type EventDetailSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: EventRecord | null;
  /**
   * The upcoming meetings of the series this occurrence belongs to, soonest
   * first and this one included, listed under it (#3707), whether the sheet
   * was opened from the list or the calendar. `null` or absent for a one-time
   * event.
   */
  series?: EventRecord[] | null;
  /**
   * The series' rule, read off its head by the caller: only the head row
   * carries one, so a generated meeting's own `recurrence_rule` is `null`.
   */
  seriesRule?: unknown;
  /** Opens another meeting of {@link series} in this sheet. */
  onSelectOccurrence?: (event: EventRecord) => void;
  usingPreviewData: boolean;
  onRequestEdit: (event: EventRecord) => void;
  onEventDeleted: () => Promise<void> | void;
  /**
   * Open inside the Events page instead of over the app (`shared/panel.tsx`
   * § Docked). The Events page sets it; a caller with no page of its own
   * leaves the sheet.
   */
  docked?: boolean;
  /**
   * The chat card's ask to open the member's Can't make it line
   * (`/events?event=<id>&excuse=1`, #4660): it applies only while the sheet
   * shows that event, and each new `count` opens the line again.
   */
  excuseAsk?: { eventId: string; count: number } | null;
};

export function EventDetailSheet({
  open,
  onOpenChange,
  event,
  series = null,
  seriesRule,
  onSelectOccurrence,
  usingPreviewData,
  onRequestEdit,
  onEventDeleted,
  docked = false,
  excuseAsk = null,
}: EventDetailSheetProps) {
  const eventId = typeof event?.id === "string" ? event.id : "";
  const eventQuery = useEvent(!usingPreviewData ? eventId : "");
  const deleteEventMutation = useDeleteEvent();
  // `DELETE /v1/events/:id` and the `PATCH /v1/events/:id` behind "Edit event"
  // are both paid-ops. Edit is gated here rather than only inside the editor
  // dialog because this button *is* the trigger for that flow (§5 rule 1) —
  // gating only the editor's submit would let the user reopen and refill it.
  const gate = useSubscriptionGate();
  const { confirm, confirmDialog } = useConfirmDialog();
  // With meetings on, the minutes are their own document and this field is
  // the event's notes (`spec/behavior/meetings.md` § Where minutes live).
  const meetingsOn = useMeetingsModuleOn();
  const rolesQuery = useRoles();
  const { toast } = useToast();
  // Edit and Delete are `events:update` and `events:delete` on the server, so
  // a member gets neither icon rather than two that 403 (#3855). A boolean,
  // not a `<Can>`: the header has no room for an offline chip per icon. It
  // reads the permissions as `<Can>` does (`components/shared/can.tsx`):
  // loading, or failed while online, is a denial, so the icons never flash or
  // linger for a member; unanswerable for want of a connection (paused, or
  // offline with nothing cached) keeps both, disabled by the subscription
  // gate while offline, rather than hidden as if the role lacked them. The
  // preview sheet keeps both too.
  const permissionsQuery = useMyPermissions();
  const { isOffline } = useNetwork();
  const permissionsUnanswerable =
    permissionsQuery.data === undefined &&
    (permissionsQuery.fetchStatus === "paused" ||
      (isOffline &&
        (permissionsQuery.isError ||
          permissionsQuery.fetchStatus === "fetching")));
  // As `<Can>` does: a read that failed during an outage is re-run when it
  // ends, so the icons don't wait on some other gate to recover them.
  useRefetchAfterOutage({
    isOffline,
    enabled: true,
    isError: permissionsQuery.isError,
    loaded: permissionsQuery.data !== undefined,
    refetch: permissionsQuery.refetch,
  });
  const permissions = permissionsQuery.data?.permissions;
  const canEditEvent =
    usingPreviewData ||
    permissionsUnanswerable ||
    can("events:update", permissions);
  // Editing the agenda in place writes at once, so it waits for a real
  // answer rather than the optimistic one the Edit icon may show.
  const canEditInPlace = !usingPreviewData && can("events:update", permissions);
  // Chapter Files on, off, or not known yet (loading, offline, a failed
  // read), which must not read as "off".
  const moduleGate = useChapterModuleGateState();
  const documentsOn =
    moduleGate.status === "ready"
      ? moduleGate.isModuleEnabled("documents")
      : null;
  const canDeleteEvent =
    usingPreviewData ||
    permissionsUnanswerable ||
    can("events:delete", permissions);

  // Live attendance for every viewer: an officer's mark, or a check-in from
  // another device, refreshes both the roster and the member's own row (both
  // live under `["attendance", eventId]`). Held here, not in the roster, so a
  // member gets it too; one subscription per topic, because a second channel
  // on `attendance:<eventId>` releases the first.
  const chapterId = useActiveChapterId();
  useRealtimeTable({
    table: "event_attendance",
    scopeId: eventId,
    invalidate: useMemo(
      () => [
        ["attendance", eventId],
        // Must match useEvent(id) → ["events", chapterId, id]; ["events", id] never matches.
        ["events", chapterId, eventId],
      ],
      [chapterId, eventId],
    ),
    // Only while the sheet is open: the page keeps it mounted after a close,
    // and a closed sheet has nothing to refresh.
    enabled: open && Boolean(eventId) && !usingPreviewData,
  });
  // The event is gone (404), or never loaded. Not any failed read: a failed
  // background refetch keeps its data, and one throttled refetch must not
  // take Check in away from an event that is fine.
  const eventUnavailable =
    eventQuery.isError &&
    (statusOf(eventQuery.error) === 404 || eventQuery.data === undefined);

  // The shared ticking clock: Suggested goes when the meeting ends (#5534).
  const now = useNow();
  const resolvedEvent = useMemo(() => {
    if (!event) return null;
    if (usingPreviewData) return event;
    return eventQuery.data ?? event;
  }, [event, eventQuery.data, usingPreviewData]);

  const canMutate = !usingPreviewData && !eventQuery.isError;
  const eventName =
    typeof resolvedEvent?.name === "string" && resolvedEvent.name.length > 0
      ? resolvedEvent.name
      : "Untitled event";
  // Who's coming, by role (`spec/behavior/events.md` § Attendance by role).
  const audience = attendanceFieldsOf(resolvedEvent ?? {});
  const attendance = attendanceFromEvent(audience);
  // The page follows the event's clock (Paul 2026-11-22): before check-in
  // opens it is who's coming, while it's open the roster fills, and after it
  // closes the record comes first (`eventPagePhase`).
  const phase = eventPagePhase(
    resolvedEvent?.start_time,
    resolvedEvent?.end_time,
    resolvedEvent?.check_in_opens_minutes,
    now,
  );
  const invitees = useEventInvitees(audience);
  // Excuses (`spec/behavior/events.md` § Excuses): offered to a member the
  // event requires, by their roles; received by its creator, and decided by
  // them or any `events:update` holder.
  const requiredOf = useRequiredOfViewer();
  const requiredOfViewer = requiredOf(audience);
  const viewerId = useViewerUserId();
  const createdByViewer =
    viewerId !== null && resolvedEvent?.created_by === viewerId;
  // `null` for a one-time event, which then shows no cadence badge at all.
  // The head's rule when the caller knows the series: a generated meeting
  // carries none of its own, and would otherwise read as one-time.
  const cadence = recurrenceLabel(
    seriesRule ?? resolvedEvent?.recurrence_rule,
    resolvedEvent?.start_time,
  );
  // The series' next meeting after this one (the list is soonest first and
  // holds this one), or the first still ahead when this one isn't in it.
  const nextOccurrence = useMemo(() => {
    if (!series || series.length === 0) return null;
    const here = series.findIndex((occurrence) => occurrence.id === eventId);
    if (here >= 0) return series[here + 1] ?? null;
    const from = Date.parse(String(resolvedEvent?.start_time ?? ""));
    return (
      series.find(
        (occurrence) => Date.parse(String(occurrence.start_time ?? "")) > from,
      ) ?? null
    );
  }, [series, eventId, resolvedEvent?.start_time]);
  const schedule = formatDayTimeRange(
    resolvedEvent?.start_time,
    resolvedEvent?.end_time,
  );
  const location =
    typeof resolvedEvent?.location === "string" && resolvedEvent.location.trim()
      ? resolvedEvent.location.trim()
      : null;
  const points = pointsLabel(resolvedEvent?.point_value);
  const description =
    typeof resolvedEvent?.description === "string"
      ? resolvedEvent.description
      : "";
  const notes =
    typeof resolvedEvent?.notes === "string" ? resolvedEvent.notes : "";
  // This meeting's own agenda and attachments (#4934). The read has no
  // response schema, so both are read defensively.
  const agenda = readEventAgenda(resolvedEvent?.agenda);
  const attachments = readEventAttachments(resolvedEvent?.attachments);
  // `checkInZoneState`: a zone with a bad point refuses every check-in, which
  // is not "no zone", and a zoneless event whose check-in needs an officer's
  // code (#4808) is not "check in from anywhere" either.
  const zoneState = checkInZoneState(
    resolvedEvent?.check_in_zone,
    resolvedEvent?.check_in_needs_code,
  );
  // Only the event's own read says whether an officer's code is required:
  // the list row the sheet opens with doesn't carry it. Until that read lands,
  // offering Check in could be a sure refusal, so the check-in block waits,
  // as the chat card does. A failed read stops waiting, and the server's
  // answer explains itself.
  const checkInReadPending =
    !usingPreviewData && eventQuery.data === undefined && !eventQuery.isError;
  const hasCheckInZone = zoneState === "zone";
  const checkInZoneIsMalformed = zoneState === "malformed";
  const checkInZoneName =
    typeof resolvedEvent?.check_in_zone_name === "string"
      ? resolvedEvent.check_in_zone_name.trim()
      : "";

  const roleNameById = useMemo(
    () =>
      new Map(
        toRoleOptions(rolesQuery.data, "keep").map((role) => [
          role.id,
          role.name,
        ]),
      ),
    [rolesQuery.data],
  );

  async function handleDelete() {
    if (!eventId) return;
    // A repeating event asks which it means, as the editor and the phone do
    // (`deleteOffersSeriesChoice`); a series delete never removes a meeting
    // that already happened.
    const seriesEvent = editTargetOf(resolvedEvent, null)?.event;
    const asksScope =
      !!seriesEvent && deleteOffersSeriesChoice(seriesEvent, new Date());
    const confirmed = await confirm(
      asksScope
        ? {
            title: SERIES_SCOPE_COPY.deleteTitle,
            description: SERIES_SCOPE_COPY.deleteMessage,
            confirmLabel: SERIES_SCOPE_COPY.allUpcoming,
            alternativeLabel: SERIES_SCOPE_COPY.thisEvent,
            tone: "destructive",
          }
        : {
            title: `Delete ${eventName}?`,
            description:
              "This cannot be undone, and attendance records for the event may be affected.",
            confirmLabel: "Delete event",
            tone: "destructive",
          },
    );
    if (!confirmed) return;
    const scope = asksScope && !confirmed.alternative ? "series" : "instance";

    try {
      await deleteEventMutation.mutateAsync({ id: eventId, scope });
    } catch (error) {
      // No Try again: the toast outlives this sheet, and a retry that lands
      // after the member opened another event would close that one. The
      // sheet stays open on a failure, so Delete is still there.
      toastFailure({
        title: "Couldn't delete the event",
        error,
        fallback: "Nothing changed. Try again in a moment.",
      });
      return;
    }

    toast({
      title: "Event deleted",
      description:
        scope === "series"
          ? `Every upcoming ${eventName} was removed from the calendar.`
          : `${eventName} was removed from the calendar.`,
    });
    onOpenChange(false);

    try {
      await onEventDeleted();
    } catch {
      toast({
        title: "Event deleted, but refresh failed",
        description: "Reload this page to sync the latest event list.",
        variant: "destructive",
      });
    }
  }

  const editControl = gate.controlProps(!resolvedEvent);
  const deleteControl = gate.controlProps(
    !canMutate || deleteEventMutation.isPending,
  );
  const canTakeAttendance = can("events:update", permissions);
  // The roster is the side list once check-in opens, for whoever takes
  // attendance; before then, and for everyone else, it's who's coming.
  const showRoster = phase !== "upcoming" && !!eventId && !usingPreviewData;

  // The check-in row, said once: first among the details while check-in is
  // open, since it's the one thing a member does then, and in its form order
  // otherwise. The zone only matters while a check-in can be made.
  const checkInRow = (
    <DetailRow
      glyph="checkIn"
      label={EVENT_FORM_ROW_LABELS.checkIn}
      align="start"
    >
      {eventId && !usingPreviewData ? (
        <MyCheckIn
          eventId={eventId}
          start={resolvedEvent?.start_time}
          end={resolvedEvent?.end_time}
          opensMinutes={resolvedEvent?.check_in_opens_minutes}
          pointValue={resolvedEvent?.point_value}
          eventUnavailable={eventUnavailable}
          zone={zoneState}
          eventPending={checkInReadPending}
        />
      ) : null}
      {checkInZoneIsMalformed && phase !== "past" ? (
        // A broken zone is worth saying early: an officer can fix it before
        // the night instead of at the door.
        <div className="mt-1 flex items-start gap-2 rounded-md border border-warning/45 bg-warning-tint p-3 text-caption text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            This event&apos;s zone is incomplete, so every check-in is rejected.
            Edit the event to finish or clear it.
          </div>
        </div>
      ) : phase !== "live" ? null : hasCheckInZone ? (
        <p className="text-caption text-muted-foreground">
          {checkInZoneLine(checkInZoneName)}
        </p>
      ) : zoneState === "code" ? (
        <p className="text-caption text-muted-foreground">
          No zone. An officer&apos;s screen is showing the code, so members scan
          it to check in.
        </p>
      ) : (
        <p className="text-caption text-muted-foreground">
          No zone, so members can check in from anywhere.
        </p>
      )}
    </DetailRow>
  );

  return (
    <Panel
      open={open}
      onOpenChange={onOpenChange}
      docked={docked}
      backLabel="Back to events"
    >
      {/*
        No description: the one this had explained the sheet to someone already
        reading it. `aria-describedby={undefined}` says so to Radix, which
        otherwise warns about a missing Description.
      */}
      <PanelContent aria-describedby={undefined}>
        {/*
          The panel's actions sit in its title row, beside the close
          (components.md § Chrome weight): Edit as an icon, and Delete in the
          ⋯, never on its own in the header (rulebook § Page layout:
          destructive actions sit behind ⋯).
        */}
        <PanelHeader
          actions={
            <>
              {canEditEvent ? (
                <IconButton
                  label="Edit event"
                  {...editControl}
                  onClick={() => {
                    if (!resolvedEvent) return;
                    onRequestEdit(resolvedEvent);
                  }}
                >
                  <Pencil aria-hidden="true" />
                </IconButton>
              ) : null}
              {canDeleteEvent ? (
                <ActionMenuButton
                  label={`More for ${eventName}`}
                  busy={deleteEventMutation.isPending}
                  entries={[
                    {
                      type: "item",
                      key: "delete",
                      label: "Delete event",
                      icon: Trash2,
                      destructive: true,
                      disabled: deleteControl.disabled,
                      onSelect: () => void handleDelete(),
                    },
                  ]}
                />
              ) : null}
            </>
          }
        >
          {/*
            The event's kind mark (#5560): the sky bar its agenda row and
            hour-grid block wear, so dot, row, grid and sheet read as one
            thing. Whether it requires the viewer is a chip in the state line
            under it, the one the phone, the list and the chat card draw.
          */}
          <span
            aria-hidden="true"
            data-testid="event-kind-mark"
            data-hue={EVENT_HUE}
            className="mr-2 inline-block h-4 w-1 rounded-full align-[-2px]"
            style={{ backgroundColor: EVENT_HUE }}
          />
          <span>{eventName}</span>
        </PanelHeader>
        {/*
          `gap-0`: the blocks below carry their own top margins. Docked on a
          wide page the body takes the side list's width too (the panel's
          own 576px plus the rail), centred as the panel's inset does.
        */}
        <PanelBody
          className={cn(
            "gap-0",
            docked && "px-[max(1.25rem,calc((100%_-_960px)/2_+_1.25rem))]",
          )}
        >
          {/* Where it stands, first (#5777): on now, or ended today, and
              whether it requires the viewer. */}
          {resolvedEvent ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 empty:hidden">
              <EventNowPill event={resolvedEvent} now={now} />
              {requiredOfViewer ? (
                <Badge variant="outline">{EVENT_PAGE_COPY.required}</Badge>
              ) : null}
            </div>
          ) : null}
          {usingPreviewData ? (
            <div className="mt-5 flex items-start gap-3 rounded-md border border-warning/45 bg-warning-tint p-3 text-caption text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                Showing preview event details. Sign in to edit and delete live
                events.
              </div>
            </div>
          ) : null}

          {eventQuery.isLoading && !usingPreviewData ? (
            // A skeleton, not a spinner and caption (`components.md` §10).
            <SectionSkeleton label="Loading event details" className="mt-6">
              <SkeletonText lines={4} />
            </SectionSkeleton>
          ) : null}

          {canEditEvent || canDeleteEvent ? (
            <SubscriptionNotice gate={gate} feature="editing events" />
          ) : null}

          {/*
            Two columns when the pane is wide enough (Paul's pick
            2026-11-22): the record on the left (details, then the agenda,
            then minutes and notes, Paul 2026-11-19), the people on the right
            (who's coming, excuses, then the roster once check-in opens), as
            Linear's and GitHub's record pages keep content and people apart.
            Narrower, the side list stacks under the record. Laid out by the
            pane's own width (`@container`), since beside chat the same sheet
            is half as wide as with chat closed.
          */}
          <div className="@container mt-4">
            <div className="grid gap-5 @[52rem]:grid-cols-[minmax(0,1fr)_18rem] @[52rem]:gap-8">
              <div className="flex min-w-0 flex-col [&>*+*]:mt-5 [&>*+*]:border-t [&>*+*]:border-border [&>*+*]:pt-5">
                <section aria-label="Details" className="grid gap-2">
                  <dl className="grid gap-0.5">
                    {phase === "live" ? checkInRow : null}
                    <DetailRow glyph="when" label={EVENT_FORM_ROW_LABELS.when}>
                      {schedule ?? "Not set"}
                    </DetailRow>
                    {/* A meeting whose rule can't be read (its series head
                        isn't loaded) still says it's in one, and still links
                        on, as the phone's does. */}
                    {cadence || (series?.length ?? 0) > 1 ? (
                      <DetailRow
                        glyph="repeat"
                        label={EVENT_FORM_ROW_LABELS.repeat}
                      >
                        <span>{cadence ?? "Part of a series"}</span>
                        {/*
                          The series as one link to its next meeting, not a
                          list of every date (Paul 2026-11-19: "don't need to
                          see all the upcoming series events").
                        */}
                        {nextOccurrence && onSelectOccurrence ? (
                          <>
                            <span
                              aria-hidden="true"
                              className="text-muted-foreground"
                            >
                              {" · "}
                            </span>
                            <button
                              type="button"
                              onClick={() => onSelectOccurrence(nextOccurrence)}
                              className={cn(
                                "rounded-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline",
                                FOCUS_RING_OFFSET,
                              )}
                            >
                              Next{" "}
                              {formatDayTime(nextOccurrence.start_time) ?? ""}
                            </button>
                          </>
                        ) : null}
                      </DetailRow>
                    ) : null}
                    {location ? (
                      <DetailRow
                        glyph="location"
                        label={EVENT_FORM_ROW_LABELS.location}
                      >
                        {location}
                      </DetailRow>
                    ) : null}
                    <DetailRow
                      glyph="attendance"
                      label={EVENT_FORM_ROW_LABELS.attendance}
                      align="start"
                    >
                      <span>
                        {describeAttendance(
                          attendance,
                          (id) =>
                            roleNameById.get(id) ??
                            (rolesQuery.isSuccess ? "Removed role" : undefined),
                        )}
                      </span>
                      {/*
                        The headcount, then the viewer's own part: "You're
                        required · Can't make it?" sits here, under who's
                        coming, where it says why it's offered (it floated
                        centred under the rows before, attached to nothing).
                      */}
                      <div className="flex flex-wrap items-center gap-x-1.5 text-caption text-muted-foreground">
                        {invitees !== null ? (
                          <span>{EVENT_PAGE_COPY.people(invitees.length)}</span>
                        ) : null}
                        {eventId && !usingPreviewData && !eventUnavailable ? (
                          // Keyed by event: the sheet switches series
                          // occurrences in place, and a half-typed reason must
                          // not carry over.
                          <MyExcuse
                            key={`excuse-${eventId}`}
                            eventId={eventId}
                            required={requiredOfViewer}
                            start={resolvedEvent?.start_time}
                            end={resolvedEvent?.end_time}
                            opensMinutes={resolvedEvent?.check_in_opens_minutes}
                            writeAsk={
                              excuseAsk?.eventId === eventId
                                ? excuseAsk.count
                                : 0
                            }
                            afterCount={invitees !== null}
                          />
                        ) : null}
                      </div>
                    </DetailRow>
                    {points ? (
                      <DetailRow
                        glyph="points"
                        label={EVENT_FORM_ROW_LABELS.points}
                      >
                        {points}
                      </DetailRow>
                    ) : null}
                    {phase !== "live" ? checkInRow : null}
                    {description ? (
                      <DetailRow
                        glyph="description"
                        label={EVENT_FORM_ROW_LABELS.description}
                        align="start"
                      >
                        {/* The source is a multi-line field, so its line
                            breaks stay. */}
                        <p className="whitespace-pre-wrap break-words">
                          {description}
                        </p>
                      </DetailRow>
                    ) : null}
                  </dl>
                </section>

                {eventId && !usingPreviewData ? (
                  // Keyed by meeting: a half-typed item, or a change still
                  // waiting to save, must not carry over to another
                  // occurrence the sheet switches to.
                  <EventMeetingLists
                    key={`lists-${eventId}`}
                    eventId={eventId}
                    lists={{ agenda, attachments }}
                    // Not while the event is gone or never loaded: every
                    // write would 404, as Edit and Delete already know.
                    canEdit={canEditInPlace && !eventUnavailable}
                    // Suggested draws on minutes, so it waits for them to be on.
                    upcoming={
                      meetingsOn === true &&
                      typeof resolvedEvent?.end_time === "string" &&
                      Date.parse(resolvedEvent.end_time) > now
                    }
                    checkOffOpen={agendaCheckOffOpen(
                      resolvedEvent?.start_time,
                      new Date(now),
                    )}
                    documentsOn={documentsOn}
                  />
                ) : null}

                {eventId && !usingPreviewData ? (
                  <EventMinutes eventId={eventId} eventName={eventName} />
                ) : null}

                {notes ? (
                  <section
                    aria-label={meetingsOn ? "Notes" : "Meeting minutes"}
                  >
                    <h3 className="mb-1 text-sm font-semibold">
                      {meetingsOn ? "Notes" : "Meeting minutes"}
                    </h3>
                    {/* Same plain-text convention as chat's TextRenderer:
                      preserve the line breaks admins typed. */}
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {notes}
                    </p>
                  </section>
                ) : null}
              </div>

              {/*
                The side list. The excuses waiting on a decision come first,
                for the event's creator or anyone who takes attendance. Then
                who's coming, as people, until check-in opens; from then on,
                for whoever takes attendance, the roster. The roster is
                `events:update` on the server, so it mounts only for a viewer
                who holds it: mounted for a member, its read 403'd and the
                sheet said "Your role can't do this" (#3855). `<Can>` holds it
                back while permissions load, so it never fires that read first.
              */}
              {eventId && !usingPreviewData ? (
                <aside
                  aria-label="People"
                  className="grid min-w-0 content-start gap-5 border-t border-border pt-5 @[52rem]:border-l @[52rem]:border-t-0 @[52rem]:pl-6 @[52rem]:pt-0"
                >
                  {!eventUnavailable &&
                  (createdByViewer || canTakeAttendance) ? (
                    <ExcuseReview
                      key={`excuses-${eventId}`}
                      eventId={eventId}
                      viewerId={viewerId}
                      canUpdateEvents={canTakeAttendance}
                    />
                  ) : null}
                  {showRoster && canTakeAttendance ? (
                    <Can
                      permission="events:update"
                      offlineFallback={(retry) => (
                        <PermissionsOfflineSurface
                          description="Reconnect to see who checked in to this event."
                          onRetry={retry}
                        />
                      )}
                    >
                      <AttendancePanel
                        // Keyed by meeting: opening another one from the
                        // series starts its roster fresh, filter included.
                        key={eventId}
                        eventId={eventId}
                        eventStart={resolvedEvent?.start_time}
                        eventEnd={resolvedEvent?.end_time}
                        audience={audience}
                        phase={phase}
                      />
                    </Can>
                  ) : (
                    <EventPeople audience={audience} />
                  )}
                </aside>
              ) : null}
            </div>
          </div>
        </PanelBody>
        {confirmDialog}
      </PanelContent>
    </Panel>
  );
}

/**
 * One read-only detail, laid out as the event form's row
 * (`event-form-rows.tsx`): the same mark and label column, so the page and
 * the form that made it line up.
 */
function DetailRow({
  glyph,
  label,
  align = "center",
  children,
}: {
  glyph: EventFormGlyphName;
  label: string;
  align?: "center" | "start";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid min-h-9 grid-cols-[1rem_minmax(4.5rem,6.5rem)_minmax(0,1fr)] gap-x-2.5 py-1",
        align === "center" ? "items-center" : "items-start",
      )}
    >
      <EventFormGlyph
        name={glyph}
        className={cn("text-muted-foreground", align === "start" && "mt-0.5")}
      />
      <dt className="truncate text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm text-foreground">{children}</dd>
    </div>
  );
}
