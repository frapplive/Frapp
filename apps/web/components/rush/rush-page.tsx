"use client";

import { localIsoDate } from "@repo/formatting";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  rushPipelineAccess,
  useMyPermissions,
  useRushPipeline,
  useViewerUserId,
  type RushPipelineCandidate,
  rushDashboard,
  rushOpenProspectCount,
  rushListSubtitle,
} from "@repo/hooks";
import { describeLoadFailure } from "@repo/hooks/error-copy";
import { matchesWordStarts } from "@repo/hooks/fuzzy-match";
import { vocab } from "@repo/org-archetypes";
import {
  isRushFollowUpForViewer,
  rushFollowUpsDueCount,
} from "@repo/validation";
import { PageActions, PageViews } from "@/components/layout/page-actions";
import { HeaderSearch } from "@/components/shared/header-search";
import { ChartNoAxesColumn, Columns3, List } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { InlineNote } from "@/components/shared/inline-note";
import { NestedError, NestedOffline } from "@/components/shared/nested-states";
import { anyReadUncached } from "@/components/shared/async-states";
import {
  SubscriptionNotice,
  useSubscriptionGate,
} from "@/components/shared/subscription-gate";
import { NewButton } from "@/components/ui/new-button";
import { ViewLabels } from "@/components/shared/view-labels";
import { useChapterModuleGateState } from "@/lib/hooks/use-chapter-module-gate";
import { useChapterVocabulary } from "@/lib/hooks/use-chapter-vocabulary";
import { useListLayout, type ListLayout } from "@/lib/list-layout";
import { useIsNarrow } from "@/lib/use-is-narrow";
import { useNetwork } from "@/lib/providers/network-provider";
import { AddProspectDialog } from "./rush-add-prospect";
import { RushBoard } from "./rush-board";
import { RushList } from "./rush-list";
import { useRushMove } from "./rush-move";
import { RushProspectPanel } from "./rush-prospect-panel";
import { RushSummary } from "./rush-summary";
import { RushPageSkeleton } from "./rush-skeleton";

/** Board and List lay the prospects out; Summary counts them (#5973). */
type RushLayout = ListLayout | "summary";

const LAYOUT_OPTIONS = [
  { value: "grid", label: "Board" },
  { value: "list", label: "List" },
  { value: "summary", label: "Summary" },
] as const satisfies readonly { value: RushLayout; label: string }[];

type RushView = "all" | "follow_up";

/**
 * The page width (the header's less its 48px of gutters) below which the
 * views fold into the View menu: a 36rem header. Once they have, the header
 * holds no views, so New is folded to its glyph here (`glyphOnly`) rather
 * than by the header's views-present rule. Measured with `useIsNarrow`'s
 * hysteresis, so they unfold again only from a page 40px wider.
 */
const VIEWS_FOLD_BELOW = 528;

/** The page width (a 52rem header) below which search folds and the count goes. */
const SEARCH_FOLD_BELOW = 784;

const LAYOUT_GLYPHS = {
  grid: Columns3,
  list: List,
  summary: ChartNoAxesColumn,
} as const satisfies Record<RushLayout, unknown>;

const VIEW_OPTIONS = [
  { value: "all", label: "All" },
  { value: "follow_up", label: "Follow up" },
] as const satisfies readonly { value: RushView; label: string }[];

/** The notification's deep link: `/rush?prospect=<candidate id>`. */
export const RUSH_PROSPECT_PARAM = "prospect";

/**
 * The recruitment page (#5924): every prospect the chapter is working, as a
 * board of stage columns or as a list, switched in the header the way
 * Linear's Board and List show the same issues. The header carries the count
 * of open prospects (anyone not in a Closed stage), the switch, and New
 * prospect for a role that may add one. A prospect opens in the docked panel.
 *
 * Named in the chapter's own word (Rush, Recruitment, Intake), never a
 * hardcoded "Rush" (`spec/behavior/rush.md` § Vocabulary). Its reads need the
 * `rush` module on plus `members:view` and `rush:view`, and the page waits
 * for the permission read rather than drawing controls that might vanish.
 *
 * Follow-ups (#5934): the count reads "48 prospects · 3 follow-ups due
 * today", the viewer's own. **All / Follow up** is the header's view switch
 * (rulebook § 9: a set people switch to all day is a view, not a filter, as
 * Tasks' My tasks / Everyone's is): Follow up holds the viewer's due
 * follow-ups and the prospects they own that need one, the work ChapterBuilder's
 * follow-up alerts and a HubSpot or Pipedrive "my activities due" list
 * gather. Like Tasks, the page opens on it when it holds anything and on All
 * when it doesn't, and keeps that first answer. A role that can't work
 * prospects has nothing there, so it gets no switch. Search narrows both the
 * board and the list by name.
 */
export function RushPage() {
  const { isOffline } = useNetwork();
  const permissionsQuery = useMyPermissions();
  const permissions = permissionsQuery.data?.permissions;
  const access = rushPipelineAccess(permissions);
  const moduleGate = useChapterModuleGateState();
  const moduleOn =
    moduleGate.status === "ready" && moduleGate.isModuleEnabled("rush");
  const pipeline = useRushPipeline({ enabled: access.view && moduleOn });
  const viewerId = useViewerUserId();
  const term = vocab("recruitment", useChapterVocabulary());
  // Every write on the page is a paid op, as the chat card's are (#841).
  const gate = useSubscriptionGate();
  const [listLayout, setListLayout] = useListLayout("rush");
  // Summary is a look at the whole pipeline, not a way to lay out cards, so
  // it isn't kept between visits: the page opens on the board or list.
  const [summary, setSummary] = useState(false);
  const layout: RushLayout = summary ? "summary" : listLayout;
  const setLayout = (next: RushLayout) => {
    setSummary(next === "summary");
    if (next !== "summary") setListLayout(next);
  };
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [viewPick, setViewPick] = useState<RushView | null>(null);
  const [query, setQuery] = useState("");
  // Below the floor's few hundred pixels the header can't hold both sets of
  // views beside the title, so they fold into one View menu among the
  // actions (`RushViewMenu`). Measured on the page, which is the header's
  // width less its gutters.
  const [pageRef, narrowMeasured] =
    useIsNarrow<HTMLDivElement>(VIEWS_FOLD_BELOW);
  const foldViews = narrowMeasured === true;
  // Below a 52rem header the count goes and search folds to its glyph.
  const [searchRef, narrowSearchMeasured] =
    useIsNarrow<HTMLDivElement>(SEARCH_FOLD_BELOW);
  const narrowSearch = narrowSearchMeasured === true;
  // One box, measured against both widths.
  const measureRef = useCallback(
    (node: HTMLDivElement | null) => {
      const offViews = pageRef(node);
      const offSearch = searchRef(node);
      return () => {
        offViews?.();
        offSearch?.();
      };
    },
    [pageRef, searchRef],
  );
  const mover = useRushMove();
  const today = localIsoDate(new Date());

  if (isOffline && anyReadUncached(permissionsQuery, pipeline)) {
    return (
      <NestedOffline
        sole
        title={`${term} unavailable offline`}
        description="Reconnect to load the prospects."
        onRetry={() => {
          void permissionsQuery.refetch();
          void pipeline.refetch();
        }}
      />
    );
  }

  if (permissionsQuery.isPending || moduleGate.status === "loading") {
    return <RushPageSkeleton />;
  }
  // A read that can't answer says so, rather than wait on a skeleton that
  // would never end: the module gate's, then the permission read's.
  if (moduleGate.status === "offline" || moduleGate.status === "error") {
    return (
      <NestedError
        sole
        title={`Couldn't open ${term}`}
        description="We couldn't check which modules your chapter has on."
        onRetry={moduleGate.retry}
      />
    );
  }
  if (permissionsQuery.data === undefined) {
    return (
      <NestedError
        sole
        title={`Couldn't open ${term}`}
        description={describeLoadFailure(permissionsQuery.error)}
        onRetry={() => void permissionsQuery.refetch()}
      />
    );
  }
  if (!moduleOn) {
    return <InlineNote>{term} is off for this chapter.</InlineNote>;
  }
  if (!access.view) {
    return (
      <InlineNote>
        Your role can&apos;t see the {term.toLowerCase()} list.
      </InlineNote>
    );
  }
  if (pipeline.isPending) return <RushPageSkeleton />;
  if (pipeline.isError && !pipeline.data) {
    return (
      <NestedError
        sole
        title="Couldn't load prospects"
        description={describeLoadFailure(pipeline.error)}
        onRetry={() => void pipeline.refetch()}
      />
    );
  }

  const { stages, tags, candidates } = pipeline.data;
  const staleDays = pipeline.data.stale_days;
  const open = rushOpenProspectCount(stages, candidates);
  const due = viewerId ? rushFollowUpsDueCount(candidates, viewerId, today) : 0;
  const mine = (candidate: RushPipelineCandidate) =>
    !!viewerId &&
    isRushFollowUpForViewer(candidate, viewerId, staleDays, today);
  // Follow up only for a role that can be given one, once the viewer is known.
  const canSwitchView = access.add && !!viewerId && candidates.length > 0;
  const firstView: RushView = candidates.some(mine) ? "follow_up" : "all";
  // The opening view is kept once answered, so logging the last due contact
  // doesn't move the page under the viewer (Tasks does the same).
  if (canSwitchView && viewPick === null) setViewPick(firstView);
  const pageView: RushView = canSwitchView ? (viewPick ?? firstView) : "all";
  const inView =
    pageView === "follow_up" ? candidates.filter(mine) : candidates;
  const searching = query.trim().length > 0;
  const showWhich = canSwitchView && !summary;
  const showLayout = candidates.length > 0;
  const shown = searching
    ? inView.filter((c) => matchesWordStarts(c.display_name, query))
    : inView;
  const opened = candidates.find((c) => c.id === openId) ?? null;
  const writable = gate.allowed;
  const view = {
    stages,
    tags,
    candidates: shown,
    access,
    writable,
    selectedId: openId,
    staleDays,
    today,
    onOpen: (candidate: RushPipelineCandidate) => setOpenId(candidate.id),
    onMove: mover.request,
  };

  let body;
  if (candidates.length === 0) {
    body = (
      <InlineNote>
        {access.add
          ? `No prospects yet. Add one with New prospect, or type /${term.toLowerCase()} add in chat.`
          : "No prospects yet."}
      </InlineNote>
    );
  } else if (layout === "summary") {
    // Counts the whole pipeline, whatever the view or search narrows.
    body = (
      <RushSummary
        dashboard={rushDashboard(stages, candidates, {
          viewerId,
          staleDays,
          today,
          viewResults: access.viewResults,
        })}
        canOwn={access.add}
        onOpen={setOpenId}
      />
    );
  } else if (searching && shown.length === 0) {
    body = (
      <InlineNote>
        {pageView === "follow_up"
          ? `No one to follow up on matches "${query.trim()}".`
          : `No prospects match "${query.trim()}".`}
      </InlineNote>
    );
  } else if (shown.length === 0) {
    body = (
      <InlineNote>
        {`Nothing to follow up on. Your follow-ups show here on the day they're due, with prospects you own after ${staleDays} ${staleDays === 1 ? "day" : "days"} without a logged contact.`}
      </InlineNote>
    );
  } else {
    body = layout === "grid" ? <RushBoard {...view} /> : <RushList {...view} />;
  }

  return (
    <div ref={measureRef} className="@container space-y-6">
      {/* Board, List and Summary as plain words beside the title (#5947),
          none until there is a prospect to lay out. Summary counts the whole
          pipeline, so it hides the view and search that narrow the others. */}
      <PageViews>
        {/* All / Follow up (#5934): which prospects, a view of the page
            like Tasks' My tasks / Everyone's, for roles that work them. */}
        <ViewLabels
          label="Which prospects"
          options={showWhich && !foldViews ? VIEW_OPTIONS : []}
          value={pageView}
          onChange={setViewPick}
        />
        {/* A hairline between the two sets, as between the title and the
            first, so five words don't read as one set of views. */}
        {showWhich && showLayout && !foldViews ? (
          <span aria-hidden="true" className="mx-1.5 h-4 w-px bg-border" />
        ) : null}
        <ViewLabels
          label="Layout"
          options={showLayout && !foldViews ? LAYOUT_OPTIONS : []}
          value={layout}
          onChange={setLayout}
        />
      </PageViews>
      {/* The header folds on the page's width, as Events' does beside chat
          (#5560): below 52rem the count goes (the columns and Summary count
          the same people) and search is a glyph that opens into its field,
          so the title and both sets of views keep their room (Paul,
          2026-11-24, on the header crammed and overlapping with chat open). */}
      <PageActions>
        {!narrowSearch ? (
          <span className="min-w-0 truncate text-sm text-muted-foreground tabular-nums">
            {rushListSubtitle(open, due)}
          </span>
        ) : null}
        {candidates.length > 0 && !summary ? (
          <HeaderSearch
            narrow={narrowSearch}
            value={query}
            onChange={setQuery}
            placeholder="Search"
            label="Search prospects by name"
            glyphLabel="Search prospects"
            className="w-44 shrink"
          />
        ) : null}
        {foldViews && showLayout ? (
          <RushViewMenu
            which={showWhich ? pageView : null}
            onWhich={setViewPick}
            layout={layout}
            onLayout={setLayout}
          />
        ) : null}
        {access.add ? (
          <NewButton
            type="button"
            thing="prospect"
            glyphOnly={foldViews || narrowSearch}
            {...gate.controlProps()}
            onClick={() => setAdding(true)}
          />
        ) : null}
      </PageActions>
      <SubscriptionNotice gate={gate} feature="working prospects" />
      {body}
      <Suspense fallback={null}>
        <LinkedProspectParam
          candidateIds={candidates.map((c) => c.id)}
          onOpen={setOpenId}
        />
      </Suspense>
      {mover.dialog}
      {access.add ? (
        <AddProspectDialog open={adding} onOpenChange={setAdding} />
      ) : null}
      <RushProspectPanel
        candidate={opened}
        stages={stages}
        tags={tags}
        access={access}
        writable={writable}
        viewerId={viewerId}
        staleDays={staleDays}
        today={today}
        term={term}
        onClose={() => setOpenId(null)}
        onMove={mover.request}
      />
    </div>
  );
}

/**
 * Opens the prospect `/rush?prospect=<id>` names (a follow-up or stale push,
 * `notifications-popover.tsx`) once the pipeline holds them, then drops the
 * parameter so a refresh doesn't reopen it, as Tasks' and Events' links do.
 * An id the pipeline doesn't hold (deleted) opens nothing. Its own component
 * because `useSearchParams` needs a Suspense boundary of its own.
 */
function LinkedProspectParam({
  candidateIds,
  onOpen,
}: {
  candidateIds: readonly string[];
  onOpen: (id: string) => void;
}) {
  const searchParams = useSearchParams();
  const linked = searchParams?.get(RUSH_PROSPECT_PARAM) ?? null;
  const handled = useRef<string | null>(null);
  const latest = useRef(onOpen);
  useEffect(() => {
    latest.current = onOpen;
  });
  const holds = linked !== null && candidateIds.includes(linked);
  useEffect(() => {
    if (!linked) {
      handled.current = null;
      return;
    }
    if (handled.current === linked) return;
    handled.current = linked;
    if (holds) latest.current(linked);
    // Next keeps `useSearchParams` in step with the History API, so this
    // clears the parameter without a navigation.
    const url = new URL(window.location.href);
    url.searchParams.delete(RUSH_PROSPECT_PARAM);
    window.history.replaceState(window.history.state, "", url);
  }, [linked, holds]);
  return null;
}

/**
 * The page's views as one menu, for a header too narrow to hold All / Follow
 * up and Board / List / Summary as words beside the title (beside chat at its
 * widest, the 375px floor). The same picks as the words, in the same order,
 * the way Linear folds a view's layout into its Display menu; the glyph is
 * the current layout's, so the button says where you are.
 */
function RushViewMenu({
  which,
  onWhich,
  layout,
  onLayout,
}: {
  /** `null` for a role with one set of prospects (no All / Follow up). */
  which: RushView | null;
  onWhich: (next: RushView) => void;
  layout: RushLayout;
  onLayout: (next: RushLayout) => void;
}) {
  const Glyph = LAYOUT_GLYPHS[layout];
  const current = LAYOUT_OPTIONS.find((o) => o.value === layout)?.label;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          variant="secondary"
          className="shrink-0"
          label={`View: ${current}`}
        >
          <Glyph className="h-4 w-4" aria-hidden="true" />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {which !== null && layout !== "summary" ? (
          <>
            <DropdownMenuLabel>Which prospects</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={which}
              onValueChange={(next) => onWhich(next as RushView)}
            >
              {VIEW_OPTIONS.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuLabel>Layout</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={layout}
          onValueChange={(next) => onLayout(next as RushLayout)}
        >
          {LAYOUT_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
