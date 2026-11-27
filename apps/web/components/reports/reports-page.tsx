"use client";

import { describeLoadFailure } from "@repo/hooks/error-copy";
import { useMemo, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import {
  isReportExportEnvelope,
  useAttendanceReport,
  useEvents,
  useMembers,
  useMyPermissions,
  usePointsReport,
  useRosterReport,
  useServiceReport,
  useServiceSemesterStart,
  type ReportFormat,
  type ReportResponse,
  type ReportTruncation,
} from "@repo/hooks";
import type { MemberProfile } from "@repo/hooks";
import { memberLabel } from "@repo/hooks/display-names";
import { formatDayTime, formatEventDayTime } from "@repo/formatting";
import { formatEventWhenOr } from "@repo/formatting";
import {
  can,
  REPORTS_COPY,
  reportPreviewHeading,
  type ReportKindKey,
} from "@repo/validation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NestedError, NestedLoading } from "@/components/shared/nested-states";
import { PermissionsOfflineSurface } from "@/components/shared/async-states";
import {
  DocumentsGlyph,
  ReportsGlyph,
} from "@/components/documents/resources-glyphs";
import { DateField } from "@/components/ui/date-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Can } from "@/components/shared/can";
import {
  SubscriptionNotice,
  useSubscriptionGate,
} from "@/components/shared/subscription-gate";
import { useToast } from "@/lib/hooks/use-toast";
import { asArray, getErrorMessage, type ExportFormat } from "@/lib/utils";
import { ExportMenu } from "@/components/shared/export-menu";
import { ReportsFormSkeleton } from "@/components/reports/reports-skeleton";
import { InlineNote } from "@/components/shared/inline-note";
import { SectionLabel } from "@/components/shared/section-label";
import {
  SETTINGS_VALUE_TRIGGER,
  SettingsGroup,
  SettingsRow,
} from "@/components/shared/settings-row";

type ReportKind = ReportKindKey;

const reportLabel: Record<ReportKind, string> = REPORTS_COPY.kinds;

const REPORT_KINDS: readonly ReportKind[] = [
  "attendance",
  "points",
  "roster",
  "service",
];

/**
 * The Dates row's one menu (#6031): this semester (from the chapter's last
 * rollover, the way the service standings count it), all time, or two dates
 * of the officer's own.
 */
type DatesChoice = "semester" | "all" | "custom";

type ReportRow = Record<string, unknown>;

type PickerOption = { id: string; label: string };

function asRecords(data: unknown): Record<string, unknown>[] {
  return asArray<unknown>(data).filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === "object" && entry !== null,
  );
}

/** Options for the event picker: name plus start time, so two same-named events stay distinguishable. */
function buildEventOptions(data: unknown): PickerOption[] {
  return asRecords(data)
    .map((event) => {
      const id = String(event.id ?? "");
      if (!id) return null;
      const name = String(event.name ?? "Untitled event");
      return {
        id,
        // The time as well as the day: two events can share a name and a
        // date (a morning and an evening chapter meeting).
        label: [
          name,
          formatEventWhenOr(
            event,
            (start) => formatDayTime(start),
            (record) => formatEventDayTime(record),
          ),
        ]
          .filter(Boolean)
          .join(" · "),
      };
    })
    .filter((option): option is PickerOption => option !== null);
}

/**
 * Options for the member picker: display name plus email, falling back to a
 * short id when both are missing.
 *
 * Uses the full `useMembers()` profile rather than the lighter
 * `useChapterRoster()` (which is the documented default for a display-only
 * concern like this): the roster projection carries no `email`, and email is
 * what the AC asks for to disambiguate same-named members.
 */
function buildMemberOptions(members: MemberProfile[]): PickerOption[] {
  return members
    .map((member) => {
      const id = member.user_id;
      if (!id) return null;
      // The shared label, with the email beside it rather than instead of it,
      // so an unnamed member reads the same here as on every other surface.
      const name = memberLabel(member.display_name, id);
      const email = member.email;
      const label = email ? `${name} (${email})` : name;
      return { id, label };
    })
    .filter((option): option is PickerOption => option !== null);
}

type PickerFieldQuery = {
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
};

type PickerRowProps = {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: PickerOption[];
  query: PickerFieldQuery;
  /** The row's value for a chapter-wide report: "All events". */
  allLabel: string;
  /** Plural noun used in the empty/error copy, e.g. "events". */
  noun: string;
  disabled?: boolean;
};

/**
 * A named-entity filter: a settings row whose value opens the app's Select,
 * backed by a live list. "All" is a chapter-wide report (`ALL_VALUE` in the
 * picker, since a Radix item can't carry an empty value). There is no
 * typed-id fallback: an officer picks a name, never an id (principles.md
 * P2.2). A list that failed or is empty says so in the row's one line.
 */
/** The picker's "everyone" row; the field's value stays `""` for it. */
const ALL_VALUE = "__all__";

function PickerRow({
  id,
  label,
  value,
  onValueChange,
  options,
  query,
  allLabel,
  noun,
  disabled = false,
}: PickerRowProps) {
  const labelId = `${id}-label`;
  return (
    <SettingsRow
      label={<span id={labelId}>{label}</span>}
      description={
        query.isError ? (
          <span className="text-destructive">
            Couldn&apos;t load {noun}.{" "}
            <button
              type="button"
              onClick={() => query.refetch()}
              className="underline underline-offset-2"
            >
              Retry
            </button>
          </span>
        ) : !query.isPending && options.length === 0 ? (
          `No ${noun} yet, so the report is chapter-wide.`
        ) : undefined
      }
      control={
        <Select
          value={value === "" ? ALL_VALUE : value}
          onValueChange={(next) =>
            onValueChange(next === ALL_VALUE ? "" : next)
          }
          disabled={disabled || query.isPending}
        >
          <SelectTrigger
            id={id}
            aria-labelledby={labelId}
            className={SETTINGS_VALUE_TRIGGER}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>{allLabel}</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  );
}

function flattenRecord(value: unknown, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  if (value === null || value === undefined) return result;
  if (typeof value !== "object") {
    result[prefix || "value"] = String(value);
    return result;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (child !== null && typeof child === "object" && !Array.isArray(child)) {
      Object.assign(result, flattenRecord(child, next));
    } else if (Array.isArray(child)) {
      result[next] = JSON.stringify(child);
    } else {
      result[next] = child === null || child === undefined ? "" : String(child);
    }
  }
  return result;
}

/**
 * Flatten any report payload shape into rows ready for `exportRows`.
 *
 * Each API handler returns either `{ rows: [...] }`, `{ entries: [...] }`, or
 * a bare array. We normalize to rows and flatten each row's keys — column
 * order, escaping, and each file type's encoding are the shared `exportRows`'s job.
 */
function buildRows(payload: unknown): Record<string, string>[] {
  return extractRows(payload).map((row) => flattenRecord(row));
}

function extractRows(payload: unknown): ReportRow[] {
  if (Array.isArray(payload)) return payload as ReportRow[];
  if (payload && typeof payload === "object") {
    const bag = payload as Record<string, unknown>;
    for (const key of ["rows", "entries", "members", "items", "data"]) {
      const candidate = bag[key];
      if (Array.isArray(candidate)) return candidate as ReportRow[];
    }
  }
  return [];
}

/**
 * One sentence naming what the API said was cut.
 *
 * Prefers the server's note over the row cap: a roster truncated by its
 * transaction read is the right length with wrong balances, so quoting a row
 * limit it never reached reads as a false alarm and teaches officers to ignore
 * the warning.
 */
function truncationSummary(truncation: ReportTruncation): string {
  if (truncation.note) {
    return `${truncation.note[0]?.toUpperCase()}${truncation.note.slice(1)}.`;
  }
  return truncation.rowLimit
    ? `Capped at ${truncation.rowLimit.toLocaleString()} rows.`
    : "The API reported this report as incomplete.";
}

export function ReportsPage() {
  return (
    <>
      {/*
        No heading of its own: it is the body of Chapter settings' Reports
        page (#3837), whose header names it.
      */}
      <Can
        permission="reports:export"
        offlineFallback={(retry) => (
          <PermissionsOfflineSurface
            description="Reconnect to check whether you can export chapter data."
            onRetry={retry}
          />
        )}
        fallback={<ReportsFormSkeleton />}
        deniedFallback={
          <p className="text-sm text-muted-foreground">
            Your role can&apos;t export chapter data. Ask your chapter president
            for access.
          </p>
        }
      >
        <ReportsForm />
      </Can>
    </>
  );
}

/**
 * The export form in the settings-rows shape (#6031): one group whose every
 * row is a picker, the two buttons that ask the API, then the Preview group
 * with Export in its heading, acting on what was generated. Inside the
 * gate, so a visitor without `reports:export` never reads the event, member
 * or semester lists behind its pickers.
 */
function ReportsForm() {
  const { toast } = useToast();
  // All four report routes are POSTs on `ReportController`, which carries no
  // `@FreeTier`, so generating one is a paid-op even though it reads like a
  // read (#841). Both buttons that reach `invokeReport` mirror the gate; the
  // filters and the local export serialization below do not (§5: never gate a
  // read). The server guard is still the enforcement.
  const gate = useSubscriptionGate();
  const attendance = useAttendanceReport();
  const points = usePointsReport();
  const roster = useRosterReport();
  const service = useServiceReport();
  // Mirrors the `<Can permission="reports:export">` gate this page renders
  // behind (same cached query, so this costs no extra request): without it,
  // `useEvents`/`useMembers` would fetch every member's full profile —
  // email, bio, graduation year, city, company — for a visitor who cannot
  // even see this page, purely as a side effect of pickers they'll never see.
  const permissionsQuery = useMyPermissions();
  const canFilterByEventOrMember = can(
    "reports:export",
    permissionsQuery.data?.permissions ?? [],
  );
  const eventsQuery = useEvents({ enabled: canFilterByEventOrMember });
  const membersQuery = useMembers({ enabled: canFilterByEventOrMember });
  const eventOptions = useMemo(
    () => buildEventOptions(eventsQuery.data),
    [eventsQuery.data],
  );
  const memberOptions = useMemo(
    () => buildMemberOptions(membersQuery.data ?? []),
    [membersQuery.data],
  );

  const [kind, setKind] = useState<ReportKind>("attendance");
  const [dates, setDates] = useState<DatesChoice>("semester");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  // This semester starts the day after the last rollover's end, read from
  // the chapter's semester archives as the service standings read it: a
  // `YYYY-MM-DD`, null for a chapter that never rolled over (this semester
  // is all time), undefined while unread. A viewer the archives refuse
  // can't have This semester, so the menu offers it dimmed and the row
  // falls back to All time.
  const semester = useServiceSemesterStart();
  const semesterUnavailable = semester.start === undefined && semester.isError;
  const semesterPending = semester.start === undefined && !semester.isError;
  const shownDates: DatesChoice =
    dates === "semester" && semesterUnavailable ? "all" : dates;
  const range: { start_date?: string; end_date?: string } =
    shownDates === "custom"
      ? { start_date: startDate || undefined, end_date: endDate || undefined }
      : shownDates === "semester" && semester.start
        ? { start_date: semester.start }
        : {};
  const usesDates = kind === "attendance" || kind === "service";
  // A semester report waits for the semester's start rather than running
  // as all time and saying it was this semester.
  const waitingForDates =
    usesDates && shownDates === "semester" && semesterPending;
  const [memberId, setMemberId] = useState("");
  const [eventId, setEventId] = useState("");
  const [pointsWindow, setPointsWindow] = useState<
    "all" | "semester" | "month"
  >("all");
  const [preview, setPreview] = useState<ReportRow[] | null>(null);
  /** Truncation reported alongside the current preview, if any. */
  const [truncation, setTruncation] = useState<ReportTruncation | null>(null);
  /*
    A failed run used to be a toast and nothing else: `setPreview` was
    never reached, so `preview` stayed `null` and the panel fell through to
    "Generate a report to see a preview here." — a failure rendering as the
    initial state, with no retry. README §4 requires an error state with a
    retry path on every async view, and `writing.md` §7's Reports table had
    no Error row for it, which is why nothing caught it.
  */
  const [previewError, setPreviewError] = useState<string | null>(null);
  /*
    Which run the preview belongs to.

    `onFilterChange` clears the preview the moment a filter is edited, but it
    cannot cancel a request already in flight — so a generate started under the
    old filters would resolve afterwards and call `setPreview` with rows that no
    longer match what the form says. The member sees a table scoped to nobody
    beside a Member ID field naming somebody, and "Export" — which gates
    only on `preview` being non-empty — exports those rows under that
    appearance. Each run takes a token and only the newest one is allowed to
    write.
  */
  const runToken = useRef(0);

  /**
   * Any filter edit invalidates the preview.
   *
   * "Export" serializes `preview`, while "Download PDF" re-queries with
   * whatever the filters currently say. Without this, editing a date after
   * generating leaves the two buttons exporting different data from the same
   * screen — and the export silently carries rows that no longer match the filters
   * the user is looking at. The kind Select already cleared it; the filter
   * inputs did not.
   */
  function onFilterChange<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      runToken.current += 1;
      setPreview(null);
      setTruncation(null);
      setPreviewError(null);
    };
  }
  // Tracked separately from the mutation's own isPending: the PDF export reuses
  // the same mutation, so without this the preview panel would flip to its
  // loading state during a download that never touches the preview.
  const [pdfPending, setPdfPending] = useState(false);

  /** Union of flattened keys for preview rows, stable column order (matches CSV union logic). */
  const previewColumnKeys = useMemo(() => {
    if (!preview || preview.length === 0) return [];
    const seen = new Set<string>();
    const keys: string[] = [];
    for (const row of preview.slice(0, 25)) {
      for (const key of Object.keys(flattenRecord(row))) {
        if (!seen.has(key)) {
          seen.add(key);
          keys.push(key);
        }
      }
    }
    return keys;
  }, [preview]);

  const activeMutation = useMemo(() => {
    switch (kind) {
      case "attendance":
        return attendance;
      case "points":
        return points;
      case "roster":
        return roster;
      case "service":
        return service;
    }
  }, [attendance, kind, points, roster, service]);

  /** Run the selected report at a given format, with the current filters. */
  async function invokeReport(
    format: ReportFormat,
  ): Promise<ReportResponse<unknown>> {
    if (kind === "attendance") {
      return attendance.mutateAsync({
        format,
        body: {
          event_id: eventId || undefined,
          ...range,
        },
      });
    }
    if (kind === "points") {
      return points.mutateAsync({
        format,
        body: {
          user_id: memberId || undefined,
          window: pointsWindow,
        },
      });
    }
    if (kind === "roster") {
      return roster.mutateAsync({ format });
    }
    return service.mutateAsync({
      format,
      body: {
        user_id: memberId || undefined,
        ...range,
      },
    });
  }

  async function runReport() {
    runToken.current += 1;
    const token = runToken.current;
    // The previous run's verdict is not this run's. Without this the header
    // keeps its "Incomplete report" badge for the whole time a fresh request
    // is in flight, describing a result nobody has seen yet.
    setTruncation(null);
    setPreviewError(null);
    try {
      const { payload, truncation } = await invokeReport("json");
      if (token !== runToken.current) return;

      const rows = extractRows(payload);
      setPreview(rows);
      setTruncation(truncation);
      setPreviewError(null);

      if (rows.length === 0) {
        toast({
          title: "Report is empty",
          description:
            "Adjust the filters (date range, member) and retry. Empty windows produce no rows.",
        });
        return;
      }

      // A truncated report must not read as a finished one here: this toast is
      // what an officer sees immediately before clicking "Export" and
      // sending the file on.
      if (truncation.truncated) {
        toast({
          title: `${reportLabel[kind]} report is incomplete`,
          variant: "destructive",
          description: `${truncationSummary(truncation)} Anything you download from this preview is not a complete record of the chapter.`,
        });
        return;
      }

      toast({
        title: `${reportLabel[kind]} report ready`,
        description: `${rows.length} row${rows.length === 1 ? "" : "s"} previewed.`,
      });
    } catch (error) {
      if (token !== runToken.current) return;
      // The report hooks throw openapi-fetch's error body, a plain object,
      // so an `instanceof Error` check never reached the server's message.
      const description = getErrorMessage(error, describeLoadFailure(error));
      // Both, deliberately: the toast reports the moment, and the panel keeps
      // saying so after the toast dismisses. A failed run that leaves the idle
      // copy on screen is a failure reported as "nothing has happened yet".
      setPreview(null);
      setTruncation(null);
      setPreviewError(description);
      toast({
        title: `Couldn't generate ${reportLabel[kind].toLowerCase()} report`,
        description,
        variant: "destructive",
      });
    }
  }

  function onRowsExported(format: ExportFormat) {
    // The export is serialized from the preview, so it inherits the preview's
    // truncation. Saying so at export time is the last point before the rows
    // leave the app and stop carrying any context at all.
    if (!truncation?.truncated) return false;
    // One toast shows at a time, so for the clipboard copy this notice also
    // has to say the rows were copied and where they go.
    const copied = format === "sheets";
    toast({
      title: copied
        ? "Copied an incomplete report"
        : "Exported an incomplete report",
      variant: "destructive",
      description: `${truncationSummary(truncation)} ${
        copied ? "Paste into a Google Sheet, but do" : "Do"
      } not treat this export as a complete record of the chapter.`,
    });
    return true;
  }

  /**
   * PDF export goes back to the API rather than reusing the preview: the server
   * renders the branded template over the whole query result — not just the 25
   * rows shown here — and stores it privately, handing back a signed URL that
   * expires in an hour.
   *
   * "Whole query result" is bounded by the API's report row ceiling, which the
   * queries now page up to rather than stopping at PostgREST's `max_rows`. A
   * chapter past the ceiling is never silently short: the envelope comes back
   * with `truncated`, and the toast below says so rather than reporting a row
   * count that reads as complete. See spec/behavior/reports.md § Row limits.
   */
  async function exportPdf() {
    setPdfPending(true);
    try {
      const { payload } = await invokeReport("pdf");
      if (!isReportExportEnvelope(payload)) {
        throw new Error("The API did not return a download link.");
      }
      if (typeof window !== "undefined") {
        const anchor = document.createElement("a");
        anchor.href = payload.url;
        anchor.rel = "noopener";
        // The signed URL already carries a download disposition; setting the
        // attribute keeps the filename when the browser honours it locally.
        anchor.download = payload.filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }
      toast({
        title: payload.truncated
          ? `${reportLabel[kind]} PDF ready (incomplete)`
          : `${reportLabel[kind]} PDF ready`,
        variant: payload.truncated ? "destructive" : undefined,
        // Prefer the server's note over the row cap. A roster truncated by the
        // transaction read is the right length with wrong balances, so quoting
        // a row limit it never reached reads as a false positive.
        description: payload.truncated
          ? `${
              payload.truncation_note ??
              `Capped at ${payload.row_limit.toLocaleString()} rows`
            }, so this document is not a complete record of the chapter. The download link expires in one hour.`
          : `${payload.row_count} row${
              payload.row_count === 1 ? "" : "s"
            } exported. The download link expires in one hour.`,
      });
    } catch (error) {
      toast({
        title: `Couldn't export ${reportLabel[kind].toLowerCase()} PDF`,
        description: getErrorMessage(error, describeLoadFailure(error)),
        variant: "destructive",
      });
    } finally {
      setPdfPending(false);
    }
  }

  const busy = pdfPending || activeMutation.isPending;
  const total = preview === null ? null : preview.length;

  return (
    // A container (#4033): beside chat (#3779) the page is narrow while the
    // window is wide.
    <div className="@container space-y-8">
      {/*
        Disable, don't hide (§5 rule 4): the filters and any preview already
        on screen stay usable while the subscription is lapsed — only the
        buttons that POST are blocked.
      */}
      <SubscriptionNotice gate={gate} feature="generating reports" />

      <section className="space-y-4">
        <SettingsGroup
          label="What to export"
          footnote={REPORTS_COPY.holds[kind]}
        >
          <SettingsRow
            label={<span id="report-kind-label">{REPORTS_COPY.report}</span>}
            control={
              <Select
                value={kind}
                // Also locked during a plain "Generate report": the run in
                // flight resolves into setPreview regardless of what the
                // select says by then, so switching mid-run would label one
                // report's rows as another's — and the export names the file
                // from the *new* kind.
                disabled={busy}
                onValueChange={(value) => {
                  setKind(value as ReportKind);
                  runToken.current += 1;
                  setPreview(null);
                  setTruncation(null);
                  setPreviewError(null);
                }}
              >
                <SelectTrigger
                  id="report-kind"
                  aria-labelledby="report-kind-label"
                  className={SETTINGS_VALUE_TRIGGER}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_KINDS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {reportLabel[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />

          {kind === "attendance" ? (
            <PickerRow
              id="report-event"
              label={REPORTS_COPY.event}
              value={eventId}
              onValueChange={onFilterChange(setEventId)}
              options={eventOptions}
              query={eventsQuery}
              allLabel={REPORTS_COPY.allEvents}
              noun="events"
            />
          ) : null}

          {kind === "points" || kind === "service" ? (
            <PickerRow
              id="report-member"
              label={REPORTS_COPY.member}
              value={memberId}
              onValueChange={onFilterChange(setMemberId)}
              options={memberOptions}
              query={membersQuery}
              allLabel={REPORTS_COPY.allMembers}
              noun="members"
            />
          ) : null}

          {kind === "points" ? (
            <SettingsRow
              label={
                <span id="report-window-label">{REPORTS_COPY.timeWindow}</span>
              }
              control={
                <Select
                  value={pointsWindow}
                  onValueChange={(value) =>
                    onFilterChange(setPointsWindow)(
                      value as typeof pointsWindow,
                    )
                  }
                >
                  <SelectTrigger
                    id="report-window"
                    aria-labelledby="report-window-label"
                    className={SETTINGS_VALUE_TRIGGER}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{REPORTS_COPY.allTime}</SelectItem>
                    <SelectItem value="semester">Current semester</SelectItem>
                    <SelectItem value="month">Rolling month</SelectItem>
                  </SelectContent>
                </Select>
              }
            />
          ) : null}

          {usesDates ? (
            <SettingsRow
              label={<span id="report-dates-label">{REPORTS_COPY.dates}</span>}
              control={
                <Select
                  value={shownDates}
                  onValueChange={(value) =>
                    onFilterChange(setDates)(value as DatesChoice)
                  }
                >
                  <SelectTrigger
                    id="report-dates"
                    aria-labelledby="report-dates-label"
                    className={SETTINGS_VALUE_TRIGGER}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semester" disabled={semesterUnavailable}>
                      {REPORTS_COPY.thisSemester}
                    </SelectItem>
                    <SelectItem value="all">{REPORTS_COPY.allTime}</SelectItem>
                    <SelectItem value="custom">
                      {REPORTS_COPY.custom}
                    </SelectItem>
                  </SelectContent>
                </Select>
              }
            />
          ) : null}

          {usesDates && shownDates === "custom" ? (
            <>
              <SettingsRow
                nested
                label={<span id="report-start-label">{REPORTS_COPY.from}</span>}
                control={
                  <DateField
                    id="report-start"
                    aria-labelledby="report-start-label"
                    lean="back"
                    value={startDate}
                    onChange={onFilterChange(setStartDate)}
                  />
                }
              />
              <SettingsRow
                nested
                label={<span id="report-end-label">{REPORTS_COPY.to}</span>}
                control={
                  <DateField
                    id="report-end"
                    aria-labelledby="report-end-label"
                    lean="back"
                    value={endDate}
                    onChange={onFilterChange(setEndDate)}
                  />
                }
              />
            </>
          ) : null}
        </SettingsGroup>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="secondary"
            onClick={exportPdf}
            // Gate on pdfPending too: activeMutation swaps when the report
            // kind changes, so keying only off it would re-enable this
            // button mid-export and let a second render be queued.
            {...gate.controlProps(busy || waitingForDates)}
          >
            {pdfPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <DocumentsGlyph className="h-4 w-4" />
            )}
            {pdfPending ? "Preparing PDF..." : REPORTS_COPY.downloadPdf}
          </Button>
          <Button
            onClick={runReport}
            {...gate.controlProps(busy || waitingForDates)}
          >
            {activeMutation.isPending && !pdfPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ReportsGlyph className="h-4 w-4" />
            )}
            {REPORTS_COPY.generate}
          </Button>
        </div>
      </section>

      <section aria-labelledby="report-preview-label" className="space-y-2">
        <header className="flex min-h-control-small flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <SectionLabel id="report-preview-label">
              {reportPreviewHeading(total)}
            </SectionLabel>
            {/*
              `spec/behavior/reports.md` caps a report at 5,000 rows and says
              truncation is never silent: once the toast dismisses, this is
              what keeps a partial table from claiming to be the whole
              report.
            */}
            {truncation?.truncated ? (
              <Badge variant="warning">Incomplete report</Badge>
            ) : null}
          </div>
          {/*
            Export acts on what was generated, so it sits on the preview's
            heading rather than beside the buttons that ask the API (#6031).
            Not subscription-gated: it serializes the preview already in
            memory and never reaches the API.
          */}
          <ExportMenu
            label={REPORTS_COPY.export}
            icon={<Download className="h-4 w-4" />}
            filenamePrefix={kind}
            getRows={() => (preview ? buildRows(preview) : [])}
            onExported={onRowsExported}
            disabled={!preview || preview.length === 0}
          />
        </header>
        {truncation?.truncated ? (
          <p className="text-sm text-muted-foreground">
            {`${truncationSummary(truncation)} This preview and any export built from it are not a complete record of the chapter.`}
          </p>
        ) : null}
        <div>
          {/*
            The nested state variants, so the states match the rest of the
            family and keep their contrast on the page.
          */}
          {activeMutation.isPending && !pdfPending ? (
            <NestedLoading message="Generating report..." sole />
          ) : previewError ? (
            <NestedError
              sole
              title={`Couldn't generate ${reportLabel[kind].toLowerCase()} report`}
              description={previewError}
              onRetry={() => void runReport()}
              // `gate.controlProps`: Retry re-enters `runReport`, the same
              // paid-ops POST the buttons carry the gate on, and the busy
              // flags go into it so a retry can't race a PDF export.
              retryProps={gate.controlProps(busy)}
            />
          ) : preview === null ? (
            <InlineNote>Generate a report to preview it here.</InlineNote>
          ) : preview.length === 0 ? (
            <InlineNote>
              Nothing in this chapter matches these filters.
            </InlineNote>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {previewColumnKeys.map((key) => (
                    <TableHead key={key} className="whitespace-nowrap">
                      {key}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.slice(0, 25).map((row, index) => {
                  const flat = flattenRecord(row);
                  return (
                    <TableRow key={index}>
                      {previewColumnKeys.map((key) => (
                        <TableCell key={key} className="whitespace-nowrap">
                          {flat[key] ?? ""}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
