"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  rushOwnerProblem,
  useSetRushOwner,
  type RushPipelineAccess,
  type RushPipelineCandidate,
} from "@repo/hooks";
import { SearchablePicker } from "@/components/shared/searchable-picker";
import { Button } from "@/components/ui/button";
import { FOCUS_RING } from "@/components/ui/focus";
import { getErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/utils";

/** A member the owner and follow-up pickers offer. */
export interface RushMemberOption {
  user_id: string;
  display_name: string;
}

/** The "No owner" row that leads the assign picker. */
const NO_OWNER: RushMemberOption = { user_id: "", display_name: "No owner" };

/**
 * The words for a refused owner or follow-up write, the phone's words
 * (`rushOwnerProblem` in `@repo/hooks`): someone got there first (409), the
 * member picked can't work prospects (400), or someone already owns them
 * (403); never the status or the server's sentence.
 */
export function rushAssignProblem(error: unknown): string {
  return (
    rushOwnerProblem(error) ??
    getErrorMessage(error, "Couldn't save that. Retry in a moment.")
  );
}

/**
 * The panel's Owner value and its control (#5934): the owner's name or "No
 * owner". A role that works prospects (`rush:add`) claims an unowned one or
 * lets go of their own; `rush:manage` assigns anyone, or no one, from a
 * searchable list of the chapter's members, as Pipedrive's and HubSpot's
 * owner field does. A refusal is said in a line under the row.
 */
export function RushOwnerControl({
  candidate,
  access,
  writable,
  viewerId,
  members,
}: {
  candidate: RushPipelineCandidate;
  access: RushPipelineAccess;
  writable: boolean;
  viewerId: string | null;
  members: readonly RushMemberOption[];
}) {
  const setOwner = useSetRushOwner();
  const [problem, setProblem] = useState<string | null>(null);
  const mine = !!viewerId && candidate.owner_id === viewerId;
  // Nobody owns themself as a prospect: a linked prospect never offers Claim.
  const self = !!viewerId && candidate.user_id === viewerId;

  function save(ownerId: string | null, ownerName: string | null) {
    setProblem(null);
    setOwner.mutate(
      { candidateId: candidate.id, ownerId, ownerName },
      {
        onError: (error) => setProblem(rushAssignProblem(error)),
      },
    );
  }

  const name = candidate.owner_id ? (candidate.owner_name ?? "") : null;
  const value = (
    <span
      className={cn(
        "min-w-0 truncate text-sm",
        name ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {name ?? "No owner"}
    </span>
  );

  let control = null;
  if (access.manage) {
    const choices = members.filter(
      (m) =>
        m.user_id !== candidate.owner_id && m.user_id !== candidate.user_id,
    );
    control = (
      <SearchablePicker
        trigger={
          <button
            type="button"
            disabled={!writable}
            aria-label={`Owner of ${candidate.display_name}: ${name ?? "No owner"}`}
            className={cn(
              "inline-flex h-8 min-w-0 max-w-full items-center gap-1 rounded-md px-2 text-left hover:bg-card-hover disabled:opacity-50",
              FOCUS_RING,
            )}
          >
            {value}
            <ChevronDown
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
        }
        align="start"
        label="Owner"
        placeholder="Find a member"
        items={choices}
        leadingItems={candidate.owner_id ? [NO_OWNER] : []}
        nameOf={(m) => m.display_name}
        keyOf={(m) => m.user_id || "none"}
        itemClassName="min-h-control-row text-sm pointer-coarse:min-h-11 pointer-coarse:text-base"
        renderItem={(m) => <RushMemberName member={m} viewerId={viewerId} />}
        onPick={(m) =>
          m.user_id ? save(m.user_id, m.display_name) : save(null, null)
        }
      />
    );
  } else {
    control = (
      <span className="flex min-w-0 items-center gap-2 px-2 py-1">
        {value}
        {access.add && !candidate.owner_id && !self ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!writable || setOwner.isPending}
            onClick={() =>
              viewerId &&
              save(
                viewerId,
                members.find((m) => m.user_id === viewerId)?.display_name ??
                  null,
              )
            }
          >
            Claim
          </Button>
        ) : null}
        {access.add && mine ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!writable || setOwner.isPending}
            onClick={() => save(null, null)}
          >
            Let go
          </Button>
        ) : null}
      </span>
    );
  }

  return (
    <div className="grid min-w-0 gap-0.5">
      {control}
      {problem ? (
        <p role="alert" className="px-2 text-caption text-destructive-text">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

/** A picker row: the member's name, and "you" beside the viewer's own. */
export function RushMemberName({
  member,
  viewerId,
}: {
  member: RushMemberOption;
  viewerId: string | null;
}) {
  return (
    <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
      <span className="min-w-0 truncate">{member.display_name}</span>
      {member.user_id && member.user_id === viewerId ? (
        <span className="shrink-0 text-caption text-muted-foreground">you</span>
      ) : null}
    </span>
  );
}
