"use client";

import { useState } from "react";
import {
  affiliationErrorCopy,
  useChapterAffiliations,
  useDecideChapterCouncil,
  useDecideChapterSchool,
  useLinkChapterSchool,
  useRequestCouncil,
  useSchoolSearch,
  SCHOOL_SEARCH_MIN_LENGTH,
  type ChapterCouncilRow,
  type SchoolSummary,
} from "@repo/hooks";
import { describeLoadFailure } from "@repo/hooks/error-copy";
import {
  CHAPTER_AFFILIATIONS_COPY as COPY,
  COUNCIL_CHAPTERS_COPY,
  COUNCIL_PROFILES,
  can,
  councilLinkLabel,
  type CouncilLinkDecision,
  type SchoolLinkDecision,
} from "@repo/validation";
import { ErrorState } from "@/components/shared/async-states";
import { InlineNote } from "@/components/shared/inline-note";
import { SearchablePicker } from "@/components/shared/searchable-picker";
import { SectionLabel } from "@/components/shared/section-label";
import { denseListClassName } from "@/components/shared/table-controls";
import { useConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { COUNCIL_HOME_COPY } from "@/components/councils/council-copy";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useNavPermissions } from "@/lib/hooks/use-nav-permissions";
import { useToast } from "@/lib/hooks/use-toast";
import { useChapterStore } from "@/lib/stores/chapter-store";
import { AffiliationRow } from "@/components/affiliations/affiliation-row";
import { SchoolAndCouncilSectionsSkeleton } from "@/components/affiliations/school-and-council-skeleton";

/**
 * A chapter's School and council (#5974; `school-layer.md` § 2.4), opened
 * from the chapter menu: the chapter's school, then the councils at it.
 * Like GitHub's organization membership (ask to join, accept an invitation,
 * leave) and Slack Connect's accept or decline of another workspace's
 * invitation, and Discord's server settings for a partnered server.
 *
 * The school comes first because every council link rides on it: the
 * councils list waits until a school is confirmed. Holders of
 * `chapter-config:view` read the page; only `chapter-config:manage` acts.
 * Every refusal reads through `affiliationErrorCopy`.
 */
export function SchoolAndCouncilPage() {
  const chapterId = useChapterStore((s) => s.activeChapterId);
  return <SchoolAndCouncil key={chapterId ?? "none"} />;
}

/**
 * The step a council row offers, from its link (null when there's none):
 * no link asks to join, the chapter's own request can be cancelled, the
 * council's invitation is answered, and a membership (or a suspension) is
 * left. Leaving is in the row's menu, not on the row (rulebook § 2).
 */
export type CouncilRowStep = "ask" | "cancel" | "answer" | "leave" | null;

export function councilRowStep(row: ChapterCouncilRow): CouncilRowStep {
  const link = row.link;
  if (!link || link.status === "declined" || link.status === "ended") {
    return "ask";
  }
  if (link.status === "proposed") {
    return link.proposed_by_side === "chapter" ? "cancel" : "answer";
  }
  return "leave";
}

function SchoolAndCouncil() {
  const permissions = useNavPermissions();
  const canManage = can("chapter-config:manage", permissions ?? []);
  const query = useChapterAffiliations();
  const linkSchool = useLinkChapterSchool();
  const decideSchool = useDecideChapterSchool();
  const requestCouncil = useRequestCouncil();
  const decideCouncil = useDecideChapterCouncil();
  const { confirm, confirmDialog } = useConfirmDialog();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function run(key: string, step: () => Promise<unknown>) {
    setBusyId(key);
    try {
      await step();
    } catch (error) {
      toast({
        variant: "destructive",
        title: affiliationErrorCopy(error, COPY.actionFailed),
      });
    } finally {
      setBusyId(null);
    }
  }

  const school = (linkId: string, status: SchoolLinkDecision) =>
    run(linkId, () => decideSchool.mutateAsync({ linkId, status }));
  const council = (linkId: string, status: CouncilLinkDecision) =>
    run(linkId, () => decideCouncil.mutateAsync({ linkId, status }));

  if (query.isPending) return <SchoolAndCouncilSectionsSkeleton />;
  if (query.isError && !query.data) {
    return (
      <ErrorState
        title={COPY.loadFailedTitle}
        description={describeLoadFailure(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const schools = (query.data?.schools ?? []).filter(
    (link) => link.status === "proposed" || link.status === "active",
  );
  const activeSchool = schools.some((link) => link.status === "active");
  // Suggested councils (the type takes the chapter's archetype) first.
  const councils = [...(query.data?.councils ?? [])].sort(
    (a, b) =>
      Number(b.offered) - Number(a.offered) ||
      a.council.name.localeCompare(b.council.name),
  );

  async function unlink(linkId: string, name: string) {
    const ok = await confirm({
      title: COPY.unlinkTitle(name),
      description: COPY.unlinkBody(name),
      confirmLabel: COPY.leaveSchool,
      tone: "destructive",
    });
    if (ok) await school(linkId, "ended");
  }

  async function leave(linkId: string, name: string) {
    const ok = await confirm({
      title: COPY.leaveTitle(name),
      description: COPY.leaveBody,
      confirmLabel: COPY.leave,
      tone: "destructive",
    });
    if (ok) await council(linkId, "ended");
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="affiliation-school" className="space-y-2">
        <SectionLabel id="affiliation-school">{COPY.school}</SectionLabel>
        {schools.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <InlineNote>{COPY.noSchool}</InlineNote>
            {canManage ? (
              <SchoolPicker
                busy={busyId === "link-school"}
                onPick={(picked) =>
                  void run("link-school", () =>
                    linkSchool.mutateAsync(picked.id),
                  )
                }
              />
            ) : null}
          </div>
        ) : (
          <ul role="list" className={denseListClassName}>
            {schools.map((link) => {
              const busy = busyId === link.link_id;
              const proposed = link.status === "proposed";
              return (
                <AffiliationRow
                  key={link.link_id}
                  name={link.school.name}
                  meta={proposed ? COPY.proposedSchool : link.school.short_name}
                  busy={busy}
                  trailing={
                    proposed && canManage ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void school(link.link_id, "active")}
                        >
                          {COPY.confirm}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void school(link.link_id, "declined")}
                        >
                          {COPY.notOurSchool}
                        </Button>
                      </>
                    ) : null
                  }
                  menu={
                    !proposed && canManage
                      ? {
                          label: COPY.rowActions(link.school.name),
                          entries: [
                            {
                              type: "item",
                              key: "unlink",
                              label: COPY.leaveSchool,
                              destructive: true,
                              onSelect: () =>
                                void unlink(link.link_id, link.school.name),
                            },
                          ],
                        }
                      : undefined
                  }
                />
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="affiliation-councils" className="space-y-2">
        <SectionLabel id="affiliation-councils">{COPY.councils}</SectionLabel>
        {!activeSchool ? (
          <InlineNote>{COPY.confirmSchoolFirst}</InlineNote>
        ) : councils.length === 0 ? (
          <InlineNote>{COPY.noCouncils}</InlineNote>
        ) : (
          <>
            <ul role="list" className={denseListClassName}>
              {councils.map((row) => (
                <CouncilRow
                  key={row.council.id}
                  row={row}
                  canManage={canManage}
                  busy={
                    busyId === row.council.id ||
                    (row.link != null && busyId === row.link.id)
                  }
                  onAsk={() =>
                    void run(row.council.id, () =>
                      requestCouncil.mutateAsync(row.council.id),
                    )
                  }
                  onDecide={(status) =>
                    row.link ? void council(row.link.id, status) : undefined
                  }
                  onLeave={() =>
                    row.link
                      ? void leave(row.link.id, row.council.name)
                      : undefined
                  }
                />
              ))}
            </ul>
            <p className="text-caption text-muted-foreground">
              {COPY.councilsHint}
            </p>
          </>
        )}
      </section>
      {confirmDialog}
    </div>
  );
}

function CouncilRow({
  row,
  canManage,
  busy,
  onAsk,
  onDecide,
  onLeave,
}: {
  row: ChapterCouncilRow;
  canManage: boolean;
  busy: boolean;
  onAsk: () => void;
  onDecide: (status: CouncilLinkDecision) => void;
  onLeave: () => void;
}) {
  const step = councilRowStep(row);
  const live = step !== "ask" && row.link;
  const type = row.council.council_type
    ? COUNCIL_PROFILES[row.council.council_type].label
    : null;
  const meta = [
    type,
    row.council.verified ? null : COUNCIL_HOME_COPY.unverified,
  ]
    .filter(Boolean)
    .join(" · ");
  const status = live ? (
    <Badge variant={row.link?.status === "suspended" ? "warning" : "outline"}>
      {councilLinkLabel(row.link!.status, row.link!.proposed_by_side)}
    </Badge>
  ) : null;
  const name = row.council.name;

  let actions = null;
  if (canManage && step === "ask") {
    actions = (
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        aria-label={`${COPY.askToJoin}: ${name}`}
        onClick={onAsk}
      >
        {COPY.askToJoin}
      </Button>
    );
  } else if (canManage && step === "cancel") {
    actions = (
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        aria-label={`${COPY.cancelRequest}: ${name}`}
        onClick={() => onDecide("ended")}
      >
        {COPY.cancelRequest}
      </Button>
    );
  } else if (canManage && step === "answer") {
    actions = (
      <>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          aria-label={`${COUNCIL_CHAPTERS_COPY.accept}: ${name}`}
          onClick={() => onDecide("accepted")}
        >
          {COUNCIL_CHAPTERS_COPY.accept}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          aria-label={`${COUNCIL_CHAPTERS_COPY.decline}: ${name}`}
          onClick={() => onDecide("declined")}
        >
          {COUNCIL_CHAPTERS_COPY.decline}
        </Button>
      </>
    );
  }

  return (
    <AffiliationRow
      name={name}
      meta={meta || undefined}
      busy={busy}
      trailing={
        status || actions ? (
          <>
            {status}
            {actions}
          </>
        ) : null
      }
      menu={
        canManage && step === "leave"
          ? {
              label: COPY.rowActions(name),
              entries: [
                {
                  type: "item",
                  key: "leave",
                  label: COPY.leave,
                  destructive: true,
                  onSelect: onLeave,
                },
              ],
            }
          : undefined
      }
    />
  );
}

/**
 * Pick your school: a search of every school (`useSchoolSearch`), and the
 * officer's pick links and confirms it in one step.
 */
function SchoolPicker({
  busy,
  onPick,
}: {
  busy: boolean;
  onPick: (school: SchoolSummary) => void;
}) {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 250);
  const search = useSchoolSearch(debounced);
  const tooShort = debounced.trim().length < SCHOOL_SEARCH_MIN_LENGTH;
  return (
    <SearchablePicker<SchoolSummary>
      align="start"
      label={COPY.pickSchool}
      placeholder={COPY.findSchool}
      items={tooShort ? [] : (search.data ?? [])}
      nameOf={(item) => item.name}
      keyOf={(item) => item.id}
      itemClassName="flex items-center gap-2.5 px-2 py-1.5"
      renderItem={(item) => (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {item.name}
          </span>
          <span className="block truncate text-caption text-muted-foreground">
            {item.short_name}
          </span>
        </span>
      )}
      onQueryChange={setQuery}
      status={
        tooShort
          ? COPY.typeMore
          : search.isPending
            ? COPY.searching
            : search.isError && !search.data
              ? COPY.searchFailed
              : undefined
      }
      onPick={onPick}
      trigger={
        <Button size="sm" variant="secondary" disabled={busy}>
          {COPY.pickSchool}
        </Button>
      }
    />
  );
}
