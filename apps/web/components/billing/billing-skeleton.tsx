import { Skeleton } from "@/components/shared/async-states";
import {
  SectionSkeleton,
  SkeletonRows,
} from "@/components/shared/page-skeletons";
import { stateMicrocopy } from "@/lib/state-microcopy";

/**
 * The plan row in its group's frame, which is what the loaded row paints:
 * plan name and badge, the meta line, and the action at the row's end.
 */
function PlanPanelFrame() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-3 rounded-[14px] border border-border bg-card px-4 py-3 @xl:flex-row @xl:items-center @xl:gap-6"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-14 rounded-md" />
        </div>
        <Skeleton className="h-[11px] w-16" />
      </div>
      <Skeleton className="h-11 w-[156px] rounded-md" />
    </div>
  );
}

/** The plan panel's own first load (and the billing page's Suspense fallback). */
export function PlanPanelSkeleton() {
  return (
    <SectionSkeleton label="Loading your plan" className="">
      <PlanPanelFrame />
    </SectionSkeleton>
  );
}

/** Invoice rows: checkbox, title and member line, amount, status, actions. */
function InvoiceRows() {
  return (
    <SkeletonRows
      rows={5}
      lead="checkbox"
      trailing={["w-14", "w-14", "w-20", "w-12"]}
    />
  );
}

/** The invoice rows, for the list's own first load under its toolbar. */
export function InvoiceRowsSkeleton() {
  return (
    <SectionSkeleton label={stateMicrocopy.billing.loading}>
      <InvoiceRows />
    </SectionSkeleton>
  );
}
