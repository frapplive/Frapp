"use client";

import { useMemo } from "react";
import { describeLoadFailure } from "@repo/hooks/error-copy";
import {
  useDeleteServiceEntry,
  useMyPermissions,
  useServiceEntries,
  useServiceSemesterStart,
} from "@repo/hooks";
import { can } from "@repo/validation";
import type { components } from "@repo/api-sdk";
import { formatDay, formatMinutesRounded } from "@repo/formatting";
import { useConfirmDialog } from "@/components/shared/confirm-dialog";
import { useFrappUser } from "@/lib/auth/use-frapp-user";
import { useToast } from "@/lib/hooks/use-toast";
import { asArray, getErrorMessage } from "@/lib/utils";
import {
  ownServiceTotals,
  type OwnServiceTotals,
} from "@/components/service/service-summary";

/**
 * One row of `GET /v1/service-entries`, from the generated contract, so a
 * change to a field a surface reads (`awarded_points`, #3868) fails the
 * typecheck rather than silently falling back.
 */
export type ServiceEntry = components["schemas"]["ServiceEntryResponseDto"];

/**
 * A row's when and how long: `"November 4 · 3h"`. `date` is a bare
 * `YYYY-MM-DD` column, which `formatDay` reads at local noon so it keeps its
 * calendar day in every zone; an unreadable date drops out of the line rather
 * than printing a placeholder. Minutes are rounded, as the phone prints them.
 */
export function serviceEntryMeta(
  entry: Pick<ServiceEntry, "date" | "duration_minutes">,
): string {
  return [formatDay(entry.date), formatMinutesRounded(entry.duration_minutes)]
    .filter(Boolean)
    .join(" · ");
}

export type MyServiceLog = {
  /** The viewer's own entries, newest first by service date, then by when logged. */
  entries: readonly ServiceEntry[];
  totals: OwnServiceTotals;
  semesterUnreadable: boolean;
  state: "loading" | "error" | "ready";
  errorDescription: string | undefined;
  retry: () => void;
  /**
   * Why the log can't be shown or withdrawn from, or `undefined`: the
   * viewer's own id is still loading, or its read failed.
   */
  notice: string | undefined;
  /** No honest list exists: the viewer's id is unknown and their read is everyone's. */
  withheld: boolean;
  canLog: boolean;
  withdraw: (entry: ServiceEntry) => Promise<void>;
  /** Render once: Withdraw asks through it. */
  confirmDialog: React.ReactNode;
};

/**
 * The viewer's own service entries and totals, for the Service hours panel on
 * their Profile (#5950; the top of the Service hours page until then, #4669).
 *
 * Read scoped to the viewer's id. Unscoped, `GET /v1/service-entries` hands a
 * `service:approve` holder every member's entries, newest first and capped at
 * the database's 1,000 rows, so an officer's older entries would fall off
 * their own log and totals.
 *
 * Without the viewer's id there is no scoped read. A member who can't approve
 * still has an honest list, because the server pins their unscoped read to
 * them; an approver's is everyone's, so it is withheld. Withdraw is off either
 * way, since `DELETE /v1/service-entries/:id` deletes by id and lets an
 * approver delete anyone's pending entry: it is offered only on a list that
 * holds nothing but the viewer's own.
 */
export function useMyServiceLog(): MyServiceLog {
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirmDialog();
  const { userId: viewerUserId, isLoading: viewerLoading } = useFrappUser();
  const { data: permissionsPayload } = useMyPermissions();
  const permissions = permissionsPayload?.permissions ?? [];
  const permissionsKnown = permissionsPayload !== undefined;
  const canApprove = can("service:approve", permissions);
  const viewerUnknown = viewerUserId === null;
  const pinnedFallback = viewerUnknown && permissionsKnown && !canApprove;

  const ownQuery = useServiceEntries(viewerUserId ?? undefined, undefined, {
    enabled: viewerUserId !== null,
  });
  // The server-pinned read, only for the member whose id didn't load.
  const pinnedQuery = useServiceEntries(undefined, undefined, {
    enabled: pinnedFallback,
  });
  const deleteEntry = useDeleteServiceEntry();
  const semester = useServiceSemesterStart();

  const entries = useMemo(() => {
    const rows = pinnedFallback
      ? asArray<ServiceEntry>(pinnedQuery.data)
      : viewerUserId === null
        ? []
        : asArray<ServiceEntry>(ownQuery.data).filter(
            (entry) => entry.user_id === viewerUserId,
          );
    return [...rows].sort((a, b) =>
      a.date !== b.date
        ? b.date.localeCompare(a.date)
        : b.created_at.localeCompare(a.created_at),
    );
  }, [pinnedFallback, pinnedQuery.data, viewerUserId, ownQuery.data]);

  const totals = useMemo(
    () => ownServiceTotals(entries, semester.start),
    [entries, semester.start],
  );

  const read = pinnedFallback ? pinnedQuery : ownQuery;
  const state: MyServiceLog["state"] = read.isError
    ? "error"
    : read.data === undefined
      ? "loading"
      : "ready";

  async function withdraw(entry: ServiceEntry) {
    const confirmed = await confirm({
      title: "Withdraw this pending service entry?",
      description: "You can always resubmit it.",
      confirmLabel: "Withdraw entry",
      tone: "destructive",
    });
    if (!confirmed) return;
    try {
      await deleteEntry.mutateAsync(entry.id);
      toast({
        title: "Entry withdrawn",
        description: "The pending entry was removed.",
      });
    } catch (error) {
      toast({
        title: "Couldn't withdraw entry",
        description: getErrorMessage(
          error,
          "Only hours that haven't been reviewed can be withdrawn.",
        ),
        variant: "destructive",
      });
    }
  }

  const withheld = viewerUnknown && !pinnedFallback;
  return {
    entries,
    totals,
    semesterUnreadable: semester.isError,
    state,
    errorDescription: read.isError
      ? describeLoadFailure(read.error)
      : undefined,
    retry: () => void read.refetch(),
    notice: !viewerUnknown
      ? undefined
      : viewerLoading
        ? "Confirming your account…"
        : "We couldn't confirm your account, so withdrawing is unavailable. Reload to try again.",
    withheld,
    canLog: can("service:log", permissions),
    withdraw,
    confirmDialog,
  };
}
