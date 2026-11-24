"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMyPermissions } from "@repo/hooks";
import { canAny } from "@repo/validation";
import { PageViews } from "@/components/layout/page-actions";
import { ViewLabels } from "@/components/shared/view-labels";
import { useChapterModuleGate } from "@/lib/hooks/use-chapter-module-gate";

type ResourcesView = "documents" | "backwork";

const VIEW_ROUTES: Record<ResourcesView, string> = {
  documents: "/documents",
  backwork: "/backwork",
};

/**
 * Resources' two views beside its title (#5949, #2956; Paul, 2026-11-24:
 * "backwork being it's own tab within resources that you can toggle into"):
 * Documents, where a meeting's posted minutes are filed, and Backwork. Plain
 * labels (`ViewLabels`, #5947), never the boxed switch (rulebook § 2).
 *
 * Each view is its own route, so a link, a bookmark and the browser's back
 * keep working, and each keeps its own list, search and filters. A label
 * moves on Enter or Space, not on an arrow key (`manual`), since choosing a
 * view loads another page. A member who can open only one of them sees no
 * labels: Backwork needs `backwork:upload` or `backwork:admin` (the API's
 * browse gate) and its module; Documents is offered while Documents or
 * Meetings is on, since minutes are filed there.
 */
export function ResourcesViews() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const permissions = useMyPermissions().data?.permissions;
  const isModuleEnabled = useChapterModuleGate();
  // Until the gate answers, a module counts as on, as the nav's rows do.
  const on = (key: string) => isModuleEnabled?.(key) ?? true;
  const options = [
    ...(on("documents") || on("meetings")
      ? [{ value: "documents" as const, label: "Documents" }]
      : []),
    ...(on("backwork") &&
    !!permissions &&
    canAny(["backwork:upload", "backwork:admin"], permissions)
      ? [{ value: "backwork" as const, label: "Backwork" }]
      : []),
  ];
  const value: ResourcesView = pathname.startsWith("/backwork")
    ? "backwork"
    : "documents";
  return (
    <PageViews>
      <ViewLabels
        label="Resources"
        activation="manual"
        options={options}
        value={value}
        onChange={(next) => {
          if (next !== value) router.push(VIEW_ROUTES[next]);
        }}
      />
    </PageViews>
  );
}
