"use client";

import { useState, type ReactNode } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import { type SemesterArchive, type useSemesterRollover } from "@repo/hooks";
import { formatDay, formatDayRange } from "@repo/formatting";
import {
  currentSemesterStart,
  dayAfter,
  newSemesterDefaults,
  SEMESTER_SETTINGS_COPY as COPY,
  semesterRolloverOpensOn,
} from "@repo/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Label } from "@/components/ui/label";
import { PermissionsOfflineSurface } from "@/components/shared/async-states";
import { Can } from "@/components/shared/can";
import { type useConfirmDialog } from "@/components/shared/confirm-dialog";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";
import {
  SubscriptionNotice,
  type SubscriptionGate,
} from "@/components/shared/subscription-gate";
import { SettingsSubpage } from "@/components/settings/settings-subpage";
import { useToast } from "@/lib/hooks/use-toast";
import { getErrorMessage } from "@/lib/utils";
import {
  SectionSkeleton,
  SkeletonRows,
} from "@/components/shared/page-skeletons";

/** The Semester page, and the new-semester page opened from its row. */
export const SEMESTER_SETTINGS_PATH = "/settings?tab=semester";
export const NEW_SEMESTER_SETTINGS_PATH = `${SEMESTER_SETTINGS_PATH}&page=new`;

/** `?page=` on the Semester row that opens the new-semester page. */
export const NEW_SEMESTER_PAGE = "new";

export type RolloverForm = ReturnType<typeof useRolloverForm>;

/**
 * The new-semester page's fields, held by the settings page rather than the
 * tab: Radix unmounts an inactive `TabsContent`, and the draft stays when the
 * officer goes back to Semester and comes again (rulebook § 4, keep the
 * draft). A rollover awaiting its confirmation finishes, and clears the form,
 * even if the officer has moved on meanwhile.
 *
 * The dates are `null` until the officer types one, so the page shows the
 * dates the archives imply (`newSemesterDefaults`) without copying them into
 * the draft: a draft kept across a rollover would otherwise hold last
 * semester's first day.
 */
export function useRolloverForm() {
  const [label, setLabel] = useState("");
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  // Defaults to off: promotion rewrites roles across the whole chapter and is
  // not one-click undoable, so it is opted into per rollover, never inherited.
  const [promoteNewMembers, setPromoteNewMembers] = useState(false);

  function reset() {
    setLabel("");
    setStart(null);
    setEnd(null);
    setPromoteNewMembers(false);
  }

  return {
    label,
    setLabel,
    start,
    setStart,
    end,
    setEnd,
    promoteNewMembers,
    setPromoteNewMembers,
    reset,
  };
}

type Props = {
  form: RolloverForm;
  pledgeTerm: string;
  /**
   * The page's dialog. `{confirmDialog}` renders above the tabs so switching
   * tab never unmounts an open confirmation mid-flight.
   */
  confirm: ReturnType<typeof useConfirmDialog>["confirm"];
  rollover: ReturnType<typeof useSemesterRollover>;
  /**
   * Scoped to the rollover on purpose. `SemesterRolloverController` is the
   * only paid-ops write on this screen (#841); `chapter-config`, `chapter`, and
   * `user` are `@FreeTier` and `notification` is not chapter-guarded at all, so
   * gating the rest would lock a lapsed chapter out of settings it is still
   * entitled to change — over-gating is the worse defect here.
   */
  rolloverGate: SubscriptionGate;
  semesters: SemesterArchive[];
  semestersPending: boolean;
  /** `?page=`: `new` opens the new-semester page. */
  page: string | null;
};

/**
 * Chapter settings → Semester (#6028, Paul's "go as drawn" 2026-11-27): the
 * page says which semester this is, offers ending it as a row that opens its
 * own page, and lists the archived semesters as rows (Canvas and Google
 * Classroom list a term by its name and dates, the current one first).
 *
 * The page's one write is the rollover, an action rather than a setting, so
 * it keeps its button on its own page (`?tab=semester&page=new`) and #6033's
 * save-on-their-own doesn't touch it. Semester is web-only: a twice-a-year
 * desk task (#4074, Paul 2026-11-27).
 */
export function SettingsSemesterTab(props: Props) {
  const main = <SemesterPage {...props} />;
  if (props.page !== NEW_SEMESTER_PAGE) return main;
  /*
    The new-semester page is a whole surface, so the gate standing in for it
    offline is the card-shaped state (`can-fallback.spec.tsx` lists it). A
    viewer who can't start one, arriving by a link, gets the Semester page.
  */
  return (
    <Can
      permission="semester:rollover"
      deniedFallback={main}
      offlineFallback={(retry) => (
        <PermissionsOfflineSurface
          description="Reconnect to check whether you can start a new semester."
          onRetry={retry}
        />
      )}
    >
      <NewSemesterPage {...props} />
    </Can>
  );
}

function SemesterPage({
  semesters,
  semestersPending,
}: Pick<Props, "semesters" | "semestersPending">) {
  const since = currentSemesterStart(semesters);
  const opensOn = semesterRolloverOpensOn(semesters);
  // Newest first, as the archives were filed.
  const archives = [...semesters].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  return (
    <div className="space-y-8">
      <SettingsGroup
        id="settings-this-semester"
        heading={COPY.thisSemester}
        footnote={COPY.thisSemesterFootnote}
      >
        <SettingsRow
          label={COPY.currentRow}
          control={
            semestersPending ? null : (
              <Value>
                {COPY.currentValue(since ? formatDay(since) : null)}
              </Value>
            )
          }
        />
        <Can permission="semester:rollover" deniedFallback={null}>
          <SettingsRow
            id="settings-start-a-new-semester"
            icon={CalendarPlus}
            label={COPY.newRow}
            value={opensOn ? COPY.opensOn(formatDay(opensOn) ?? "") : undefined}
            href={NEW_SEMESTER_SETTINGS_PATH}
          />
        </Can>
      </SettingsGroup>

      {semestersPending ? (
        <SectionSkeleton label={COPY.loadingArchives} className="">
          <SkeletonRows
            rows={3}
            lines={1}
            trailing={["w-32"]}
            trailingHeight="h-[13px]"
            rowClassName="py-2"
            bare
          />
        </SectionSkeleton>
      ) : (
        <SettingsGroup
          id="settings-archived-semesters"
          heading={COPY.archived}
          footnote={COPY.archivedFootnote}
        >
          {archives.length === 0 ? (
            <SettingsRow label={COPY.noArchives} muted control={null} />
          ) : (
            archives.map((archive) => (
              <SettingsRow
                key={archive.id}
                label={archive.label}
                control={
                  <Value>
                    {formatDayRange(archive.start_date, archive.end_date) ??
                      `${archive.start_date} – ${archive.end_date}`}
                  </Value>
                }
              />
            ))
          )}
        </SettingsGroup>
      )}
    </div>
  );
}

function Value({ children }: { children: ReactNode }) {
  return <span className="text-sm text-muted-foreground">{children}</span>;
}

/**
 * Whether the new-semester page is still what the address shows. A rollover
 * confirmed and then left (the officer moved to another row while it ran)
 * must not pull them back to Semester when it finishes.
 */
function onNewSemesterPage(): boolean {
  const url = new URL(window.location.href);
  return (
    url.searchParams.get("tab") === "semester" &&
    url.searchParams.get("page") === NEW_SEMESTER_PAGE
  );
}

function NewSemesterPage({
  form,
  pledgeTerm,
  confirm,
  rollover,
  rolloverGate,
  semesters,
}: Props) {
  const { toast } = useToast();
  const defaults = newSemesterDefaults(semesters);
  const name = form.label.trim();
  const start = form.start ?? defaults.start;
  const end = form.end ?? defaults.end;
  const opensOn = semesterRolloverOpensOn(semesters);
  const opensOnWords = opensOn ? COPY.opensOn(formatDay(opensOn) ?? "") : null;
  const promote = form.promoteNewMembers ? { pledgeTerm } : null;
  const gateProps = rolloverGate.controlProps(rollover.isPending);
  // The button says what's missing while it can't be pressed (rulebook § 9).
  const blockedBy = opensOnWords ?? (name ? null : COPY.nameFirst);

  async function startRollover(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name || opensOn) return;
    // The date fields hold "" while their text is not a date (`DateField`).
    if (!start || !end) {
      toast({
        title: COPY.pickDates,
        description: COPY.pickDatesHint,
        variant: "destructive",
      });
      return;
    }
    const range = formatDayRange(start, end) ?? `${start} – ${end}`;
    const nextDay = dayAfter(end);
    const confirmed = await confirm({
      title: COPY.confirmTitle(name),
      description: COPY.confirmBody(
        name,
        range,
        nextDay ? formatDay(nextDay) : null,
        promote,
      ),
      confirmLabel: COPY.submit,
      // Not destructive: a rollover archives rather than deletes, and
      // `writing.md` §7's own copy for this flow says the history stays. A red
      // button would state a loss the API does not perform. Promotion is a role
      // change rather than a deletion, so it does not change that reading — the
      // description above states its scope instead.
      tone: "default",
    });
    if (!confirmed) return;
    try {
      // Settles once the archives are read again (`useSemesterRollover`), so
      // Semester shows the new archive when the officer lands on it.
      await rollover.mutateAsync({
        label: name,
        start_date: start,
        end_date: end,
        promote_new_members: form.promoteNewMembers,
      });
      toast({
        title: COPY.started,
        description: COPY.startedBody(name, promote),
      });
      form.reset();
      if (onNewSemesterPage()) {
        const url = new URL(window.location.href);
        url.searchParams.delete("page");
        window.history.replaceState(null, "", url.toString());
      }
    } catch (error) {
      toast({
        title: COPY.failed,
        description: getErrorMessage(error, COPY.failedFallback),
        variant: "destructive",
      });
    }
  }

  return (
    <SettingsSubpage
      backHref={SEMESTER_SETTINGS_PATH}
      backLabel={COPY.title}
      title={COPY.newTitle}
    >
      <form onSubmit={startRollover} className="space-y-8">
        {/*
          Disable, don't hide (§5 rule 4): the notice sits on this page
          rather than the settings header so it never reads as "all of
          settings is blocked".
        */}
        <SubscriptionNotice
          gate={rolloverGate}
          feature="semester rollover"
          className="mb-0"
        />
        <div className="grid gap-3 md:grid-cols-3">
          <div className="grid gap-1">
            <Label htmlFor="semester-label">{COPY.nameLabel}</Label>
            <Input
              id="semester-label"
              value={form.label}
              onChange={(event) => form.setLabel(event.target.value)}
              placeholder={COPY.namePlaceholder}
              autoFocus
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="semester-start">{COPY.firstDay}</Label>
            <DateField
              id="semester-start"
              lean="nearest"
              placeholder={COPY.firstDayPlaceholder}
              value={start}
              onChange={form.setStart}
              required
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="semester-end">{COPY.lastDay}</Label>
            <DateField
              id="semester-end"
              lean="nearest"
              placeholder={COPY.lastDayPlaceholder}
              value={end}
              onChange={form.setEnd}
              required
            />
          </div>
        </div>
        {/*
          Pledge promotion (spec/behavior/semester-rollover.md step 3).
          Optional and off by default — it rewrites roles across the
          chapter, so it is opted into per rollover, and the confirmation
          restates it. Behind `roles:manage` because the API enforces exactly
          that on the promotion path (`PATCH /members/:id/roles`), which
          `semester:rollover` alone does not carry: offering it without would
          produce a 403 at submit. Without it the footnote stands alone.
        */}
        <Can
          permission="roles:manage"
          deniedFallback={
            <p className="px-1 text-caption text-muted-foreground">
              {COPY.limitFootnote}
            </p>
          }
        >
          <SettingsGroup label={COPY.newTitle} footnote={COPY.limitFootnote}>
            <SettingsRow
              id="semester-promote"
              label={COPY.promoteLabel(pledgeTerm)}
              description={COPY.promoteLine}
              checked={form.promoteNewMembers}
              onCheckedChange={form.setPromoteNewMembers}
              disabled={gateProps.disabled}
            />
          </SettingsGroup>
        </Can>
        <div className="flex justify-end">
          {/*
            The submit is the entry control, and a disabled default button
            also suppresses implicit Enter submission from the fields above.
          */}
          <Button
            type="submit"
            {...gateProps}
            disabled={gateProps.disabled || blockedBy !== null}
          >
            {rollover.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {blockedBy ?? COPY.submit}
          </Button>
        </div>
      </form>
    </SettingsSubpage>
  );
}
