"use client";

import { useMemo, useState } from "react";
import { describeLoadFailure } from "@repo/hooks/error-copy";
import {
  memberFallbackLabel,
  useMemberDisplayNames,
  useServiceEntries,
} from "@repo/hooks";
import { statusLabel } from "@repo/validation";
import { Button } from "@/components/ui/button";
import {
  ActiveFilterChips,
  FilterMenu,
  type FilterMenuFilter,
} from "@/components/shared/filter-menu";
import { InlineNote, InlineNoteAction } from "@/components/shared/inline-note";
import { NestedError } from "@/components/shared/nested-states";
import { SkeletonRows } from "@/components/shared/page-skeletons";
import { SectionLabel } from "@/components/shared/section-label";
import { denseListClassName } from "@/components/shared/table-controls";
import { ServiceEntryRow } from "@/components/service/service-entry-row";
import {
  serviceEntryMeta,
  type ServiceEntry,
} from "@/components/service/use-my-service-log";
import { useViewServiceProof } from "@/components/service/use-view-service-proof";
import { asArray } from "@/lib/utils";

const REVIEWED = ["APPROVED", "REJECTED"] as const;

/**
 * The chapter's reviewed service entries, on Chapter settings' Service hours
 * page (#5950; "Chapter history" at the foot of the Service hours page until
 * then): every member's approved and rejected entries, newest first by the
 * day of service, with who logged it, the reviewer's note and the points its
 * approval recorded.
 *
 * Narrow it to one member or one outcome, and open an entry's proof. Pending
 * entries are not here: reviewing them is Activity's, on web and phone
 * (`spec/behavior/service-hours.md` § Approval workflow).
 *
 * Drawn only for a `service:approve` holder (the `service-history` tool in
 * `settings-access.ts`), whose unscoped read is the whole chapter's; anyone
 * else's is pinned to their own entries, which their Profile already shows.
 */
export function ServiceHistory() {
  const [member, setMember] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const entriesQuery = useServiceEntries();
  const { nameFor } = useMemberDisplayNames();
  const proof = useViewServiceProof();

  const reviewed = useMemo(
    () =>
      asArray<ServiceEntry>(entriesQuery.data)
        .filter((entry) => entry.status !== "PENDING")
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [entriesQuery.data],
  );
  const nameOf = (userId: string) =>
    nameFor(userId) ?? memberFallbackLabel(userId);
  // Only the members who have a reviewed entry: a filter that listed the
  // whole roster would mostly lead to nothing.
  const memberOptions = useMemo(() => {
    const ids = [...new Set(reviewed.map((entry) => entry.user_id))];
    return ids
      .map((userId) => ({
        value: userId,
        label: nameFor(userId) ?? memberFallbackLabel(userId),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [reviewed, nameFor]);
  const shown = reviewed.filter(
    (entry) =>
      (member === "ALL" || entry.user_id === member) &&
      (status === "ALL" || entry.status === status),
  );

  const filters: FilterMenuFilter[] = [
    {
      key: "member",
      label: "Member",
      options: [{ value: "ALL", label: "Any member" }, ...memberOptions],
      value: member,
      anyValue: "ALL",
      onChange: setMember,
    },
    {
      key: "status",
      label: "Outcome",
      options: [
        { value: "ALL", label: "Approved and rejected" },
        ...REVIEWED.map((value) => ({
          value,
          label: statusLabel("serviceEntry", value),
        })),
      ],
      value: status,
      anyValue: "ALL",
      onChange: setStatus,
    },
  ];
  const failed = entriesQuery.isError && entriesQuery.data === undefined;

  return (
    <section
      aria-labelledby="service-history-label"
      className="@container space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <SectionLabel
          id="service-history-label"
          count={
            !entriesQuery.isPending && !failed && shown.length > 0
              ? `${shown.length} ${shown.length === 1 ? "entry" : "entries"}`
              : null
          }
        >
          Reviewed entries
        </SectionLabel>
        {reviewed.length > 0 ? (
          <FilterMenu filters={filters} thing="reviewed entries" />
        ) : null}
      </div>
      <ActiveFilterChips filters={filters} />
      {entriesQuery.isPending ? (
        <div role="status" aria-label="Loading reviewed entries">
          <SkeletonRows rows={4} lines={2} trailing={["w-20", "w-16"]} />
        </div>
      ) : failed ? (
        <NestedError
          title="Couldn't load the chapter's service entries"
          description={describeLoadFailure(entriesQuery.error)}
          onRetry={() => void entriesQuery.refetch()}
        />
      ) : shown.length === 0 ? (
        reviewed.length === 0 ? (
          <InlineNote>Nothing reviewed yet.</InlineNote>
        ) : (
          <InlineNote>
            No entries match these filters.{" "}
            <InlineNoteAction
              onClick={() => {
                setMember("ALL");
                setStatus("ALL");
              }}
            >
              Clear filters
            </InlineNoteAction>
          </InlineNote>
        )
      ) : (
        <ul role="list" className={denseListClassName}>
          {shown.map((entry) => (
            <ServiceEntryRow
              key={entry.id}
              entry={entry}
              title={nameOf(entry.user_id)}
              body={entry.description}
              meta={serviceEntryMeta(entry)}
              action={
                entry.proof_path ? (
                  <Button
                    size="toolbar"
                    variant="ghost"
                    onClick={() => void proof.viewProof(entry.id)}
                    disabled={proof.isPending}
                  >
                    View proof
                  </Button>
                ) : null
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}
