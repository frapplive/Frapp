"use client";

import { useMemo, useState } from "react";
import {
  affiliationErrorCopy,
  chapterListingLine,
  groupCouncilChapters,
  useCouncil,
  useCouncilChapters,
  useCouncilInviteCandidates,
  useDecideCouncilChapter,
  useInviteChapter,
  type CouncilChapterRow,
  type InviteCandidate,
} from "@repo/hooks";
import { describeLoadFailure } from "@repo/hooks/error-copy";
import {
  COUNCIL_CHAPTERS_COPY as COPY,
  can,
  councilLinkLabel,
  type CouncilLinkDecision,
} from "@repo/validation";
import { PageActions } from "@/components/layout/page-actions";
import { ErrorState } from "@/components/shared/async-states";
import { InlineNote } from "@/components/shared/inline-note";
import { SearchablePicker } from "@/components/shared/searchable-picker";
import { SectionLabel } from "@/components/shared/section-label";
import { denseListClassName } from "@/components/shared/table-controls";
import { useConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InviteGlyph } from "@/components/members/directory-glyphs";
import { useNavPermissions } from "@/lib/hooks/use-nav-permissions";
import { useTenantKind } from "@/lib/hooks/use-tenant-kind";
import { useToast } from "@/lib/hooks/use-toast";
import { useChapterStore } from "@/lib/stores/chapter-store";
import { AffiliationRow } from "@/components/affiliations/affiliation-row";
import { CouncilChapterRowsSkeleton } from "@/components/affiliations/council-chapters-skeleton";

/**
 * A council's Chapters (#5974; `council-types.md` § What each council's space
 * shows): its member chapters, the chapters asking to join, and the ones it
 * invited. Like Slack Connect's invitations between workspaces (each side
 * accepts or declines, and a pending invite can be cancelled) and GitHub's
 * organization membership requests, with Discord's partnered-server list for
 * the members themselves.
 *
 * Each chapter shows by its public listing only, name, kind and school: a
 * council never reads a chapter's data (#4068 decision 11). Every council
 * member reads the list (`members:view`); only `council:chapters_manage`
 * invites, answers requests and suspends or removes, so a delegate sees the
 * member chapters alone.
 */
export function CouncilChaptersPage() {
  const councilId = useChapterStore((s) => s.activeChapterId);
  return <CouncilChapters key={councilId ?? "none"} />;
}

function CouncilChapters() {
  const councilId = useChapterStore((s) => s.activeChapterId);
  const permissions = useNavPermissions();
  const canManage = can("council:chapters_manage", permissions ?? []);
  // Held until the tenant is known to be a council and the viewer can read
  // the list, so a chapter's typed visit never sends a refused read before
  // the route gate moves it on.
  const isCouncil = useTenantKind() === "council";
  const chaptersQuery = useCouncilChapters({
    enabled: isCouncil && can("members:view", permissions ?? []),
  });
  const { data: council } = useCouncil(councilId);
  const decide = useDecideCouncilChapter();
  const invite = useInviteChapter();
  const { confirm, confirmDialog } = useConfirmDialog();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const sets = useMemo(
    () => groupCouncilChapters(chaptersQuery.data ?? []),
    [chaptersQuery.data],
  );

  async function run(
    key: string,
    step: () => Promise<unknown>,
    fallback: string,
  ) {
    setBusyId(key);
    try {
      await step();
    } catch (error) {
      toast({
        variant: "destructive",
        title: affiliationErrorCopy(error, fallback),
      });
    } finally {
      setBusyId(null);
    }
  }

  function decideLink(row: CouncilChapterRow, status: CouncilLinkDecision) {
    return run(
      row.link.id,
      () => decide.mutateAsync({ linkId: row.link.id, status }),
      COPY.actionFailed,
    );
  }

  async function suspend(row: CouncilChapterRow) {
    const ok = await confirm({
      title: COPY.suspendTitle(row.chapter.name),
      description: COPY.suspendBody,
      confirmLabel: COPY.suspend,
      tone: "destructive",
    });
    if (ok) await decideLink(row, "suspended");
  }

  async function remove(row: CouncilChapterRow) {
    const ok = await confirm({
      title: COPY.removeTitle(row.chapter.name),
      description: COPY.removeBody,
      confirmLabel: COPY.remove,
      tone: "destructive",
    });
    if (ok) await decideLink(row, "ended");
  }

  const nothing =
    sets.members.length === 0 &&
    (!canManage || (sets.requests.length === 0 && sets.invited.length === 0));

  return (
    <div className="space-y-6">
      {canManage ? (
        <PageActions>
          <InviteChapterPicker
            onPick={(candidate) =>
              void run(
                candidate.chapter.id,
                () => invite.mutateAsync(candidate.chapter.id),
                COPY.inviteFailed,
              )
            }
          />
        </PageActions>
      ) : null}

      {chaptersQuery.isPending ? (
        <CouncilChapterRowsSkeleton />
      ) : chaptersQuery.isError && !chaptersQuery.data ? (
        <ErrorState
          title={COPY.loadFailedTitle}
          description={describeLoadFailure(chaptersQuery.error)}
          onRetry={() => void chaptersQuery.refetch()}
        />
      ) : (
        <>
          {canManage && sets.requests.length > 0 ? (
            <section aria-labelledby="council-requests" className="space-y-2">
              <SectionLabel id="council-requests" count={sets.requests.length}>
                {COPY.requests}
              </SectionLabel>
              <ul role="list" className={denseListClassName}>
                {sets.requests.map((row) => (
                  <AffiliationRow
                    key={row.link.id}
                    name={row.chapter.name}
                    crest
                    meta={chapterListingLine(row.chapter)}
                    busy={busyId === row.link.id}
                    trailing={
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busyId === row.link.id}
                          aria-label={`${COPY.accept}: ${row.chapter.name}`}
                          onClick={() => void decideLink(row, "accepted")}
                        >
                          {COPY.accept}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === row.link.id}
                          aria-label={`${COPY.decline}: ${row.chapter.name}`}
                          onClick={() => void decideLink(row, "declined")}
                        >
                          {COPY.decline}
                        </Button>
                      </>
                    }
                  />
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="council-members" className="space-y-2">
            <SectionLabel
              id="council-members"
              count={sets.members.length > 0 ? sets.members.length : null}
            >
              {COPY.members}
            </SectionLabel>
            {nothing ? (
              <InlineNote>
                {COPY.empty}.{canManage ? ` ${COPY.emptyBody}` : null}
              </InlineNote>
            ) : sets.members.length === 0 ? (
              <InlineNote>{COPY.empty}.</InlineNote>
            ) : (
              <ul role="list" className={denseListClassName}>
                {sets.members.map((row) => {
                  const suspended = row.link.status === "suspended";
                  return (
                    <AffiliationRow
                      key={row.link.id}
                      name={row.chapter.name}
                      crest
                      meta={chapterListingLine(row.chapter)}
                      busy={busyId === row.link.id}
                      trailing={
                        suspended ? (
                          <Badge variant="warning">
                            {councilLinkLabel(
                              row.link.status,
                              row.link.proposed_by_side,
                            )}
                          </Badge>
                        ) : null
                      }
                      menu={
                        canManage
                          ? {
                              label: COPY.rowActions(row.chapter.name),
                              entries: [
                                suspended
                                  ? {
                                      type: "item",
                                      key: "reinstate",
                                      label: COPY.reinstate,
                                      onSelect: () =>
                                        void decideLink(row, "accepted"),
                                    }
                                  : {
                                      type: "item",
                                      key: "suspend",
                                      label: COPY.suspend,
                                      onSelect: () => void suspend(row),
                                    },
                                { type: "separator", key: "sep" },
                                {
                                  type: "item",
                                  key: "remove",
                                  label: COPY.remove,
                                  destructive: true,
                                  onSelect: () => void remove(row),
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

          {canManage && sets.invited.length > 0 ? (
            <section aria-labelledby="council-invited" className="space-y-2">
              <SectionLabel id="council-invited" count={sets.invited.length}>
                {COPY.invited}
              </SectionLabel>
              <ul role="list" className={denseListClassName}>
                {sets.invited.map((row) => (
                  <AffiliationRow
                    key={row.link.id}
                    name={row.chapter.name}
                    crest
                    meta={chapterListingLine(row.chapter)}
                    busy={busyId === row.link.id}
                    trailing={
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === row.link.id}
                        aria-label={`${COPY.cancelInvite}: ${row.chapter.name}`}
                        onClick={() => void decideLink(row, "ended")}
                      >
                        {COPY.cancelInvite}
                      </Button>
                    }
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {canManage && council && !council.verified ? (
            <InlineNote className="text-caption">{COPY.unverified}</InlineNote>
          ) : null}
        </>
      )}
      {confirmDialog}
    </div>
  );
}

/**
 * Invite a chapter: the header's main action, opening the chapters at the
 * council's school that it can invite, suggested ones (the council type's
 * archetypes, `COUNCIL_LINK_OFFERS`) first. Drawn only for someone who can
 * invite, so only they read the list.
 */
function InviteChapterPicker({
  onPick,
}: {
  onPick: (candidate: InviteCandidate) => void;
}) {
  const candidates = useCouncilInviteCandidates();
  const items = candidates.data ?? [];
  return (
    <SearchablePicker<InviteCandidate>
      align="end"
      label={COPY.invite}
      placeholder={COPY.findChapter}
      items={items}
      nameOf={(item) => item.chapter.name}
      keyOf={(item) => item.chapter.id}
      groupsOf={(shown) => [
        { heading: COPY.offered, items: shown.filter((item) => item.offered) },
        { heading: COPY.others, items: shown.filter((item) => !item.offered) },
      ]}
      itemClassName="flex items-center gap-2.5 px-2 py-1.5"
      renderItem={(item) => (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {item.chapter.name}
          </span>
          <span className="block truncate text-caption text-muted-foreground">
            {chapterListingLine(item.chapter)}
          </span>
        </span>
      )}
      status={
        candidates.isPending
          ? COPY.candidatesLoading
          : candidates.isError && !candidates.data
            ? COPY.candidatesFailed
            : undefined
      }
      emptyText={COPY.noCandidates}
      onPick={onPick}
      trigger={
        <Button size="toolbar" variant="action" className="gap-2">
          <InviteGlyph className="h-4 w-4" />
          {COPY.invite}
        </Button>
      }
    />
  );
}
