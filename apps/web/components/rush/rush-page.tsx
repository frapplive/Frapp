"use client";

import { useState } from "react";
import {
  rushPipelineAccess,
  rushProspectCount,
  useMyPermissions,
  useRushPipeline,
  useViewerUserId,
  type RushPipelineCandidate,
  rushOpenProspectCount,
} from "@repo/hooks";
import { describeLoadFailure } from "@repo/hooks/error-copy";
import { vocab } from "@repo/org-archetypes";
import { PageActions } from "@/components/layout/page-actions";
import { InlineNote } from "@/components/shared/inline-note";
import { NestedError, NestedOffline } from "@/components/shared/nested-states";
import { anyReadUncached } from "@/components/shared/async-states";
import {
  SubscriptionNotice,
  useSubscriptionGate,
} from "@/components/shared/subscription-gate";
import { NewButton } from "@/components/ui/new-button";
import { SegmentedChoice } from "@/components/ui/segmented";
import { useChapterModuleGateState } from "@/lib/hooks/use-chapter-module-gate";
import { useChapterVocabulary } from "@/lib/hooks/use-chapter-vocabulary";
import { useListLayout, type ListLayout } from "@/lib/list-layout";
import { useNetwork } from "@/lib/providers/network-provider";
import { AddProspectDialog } from "./rush-add-prospect";
import { RushBoard } from "./rush-board";
import { RushList } from "./rush-list";
import { useRushMove } from "./rush-move";
import { RushProspectPanel } from "./rush-prospect-panel";
import { RushPageSkeleton } from "./rush-skeleton";

const LAYOUT_OPTIONS = [
  { value: "grid", label: "Board" },
  { value: "list", label: "List" },
] as const satisfies readonly { value: ListLayout; label: string }[];

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
  const [layout, setLayout] = useListLayout("rush");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const mover = useRushMove();

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
  const open = rushOpenProspectCount(stages, candidates);
  const opened = candidates.find((c) => c.id === openId) ?? null;
  const writable = gate.allowed;
  const view = {
    stages,
    tags,
    candidates,
    access,
    writable,
    selectedId: openId,
    onOpen: (candidate: RushPipelineCandidate) => setOpenId(candidate.id),
    onMove: mover.request,
  };

  return (
    <div className="@container space-y-6">
      <PageActions>
        <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
          {rushProspectCount(open)}
        </span>
        {candidates.length > 0 ? (
          <SegmentedChoice
            label="Layout"
            dense
            options={LAYOUT_OPTIONS}
            value={layout}
            onChange={setLayout}
          />
        ) : null}
        {access.add ? (
          <NewButton
            type="button"
            thing="prospect"
            {...gate.controlProps()}
            onClick={() => setAdding(true)}
          />
        ) : null}
      </PageActions>
      <SubscriptionNotice gate={gate} feature="working prospects" />
      {candidates.length === 0 ? (
        <InlineNote>
          {access.add
            ? `No prospects yet. Add one with New prospect, or type /${term.toLowerCase()} add in chat.`
            : "No prospects yet."}
        </InlineNote>
      ) : layout === "grid" ? (
        <RushBoard {...view} />
      ) : (
        <RushList {...view} />
      )}
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
        term={term}
        onClose={() => setOpenId(null)}
        onMove={mover.request}
      />
    </div>
  );
}
