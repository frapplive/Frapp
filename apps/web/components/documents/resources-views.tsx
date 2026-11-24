"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMyPermissions } from "@repo/hooks";
import { PageViews } from "@/components/layout/page-actions";
import {
  RESOURCES_HREF,
  RESOURCES_VIEWS,
} from "@/components/layout/nav-config";
import { isNavViewOpen } from "@/components/layout/protected-nav-item";
import { ViewLabels } from "@/components/shared/view-labels";
import { useChapterModuleGate } from "@/lib/hooks/use-chapter-module-gate";

type ResourcesView = "documents" | "backwork";

/** Each label's view, by its route in the nav's Resources row. */
const VIEW_ROUTES: Record<ResourcesView, string> = {
  documents: RESOURCES_HREF,
  backwork: "/backwork",
};

const LABELS: Record<ResourcesView, string> = {
  documents: "Documents",
  backwork: "Backwork",
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
  // The nav row's own views and gates (`RESOURCES_VIEWS`), so the labels
  // offer exactly what the row opens. Until permissions answer, a gated view
  // is held back, as the row's is.
  const options = (Object.keys(VIEW_ROUTES) as ResourcesView[]).flatMap(
    (key) => {
      const view = RESOURCES_VIEWS.find(
        (candidate) => candidate.href === VIEW_ROUTES[key],
      );
      return view && isNavViewOpen(view, permissions, isModuleEnabled)
        ? [{ value: key, label: LABELS[key] }]
        : [];
    },
  );
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
