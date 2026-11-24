"use client";

import {
  COUNCIL_SHARED_PERMISSIONS,
  isBetaOffModule,
  isCouncilPermission,
  keysForRecruitmentModel,
  RETIRED_PERMISSIONS,
  type RecruitmentModel,
} from "@repo/validation";
import { useCallback } from "react";
import { aiAvailableFrom, useAiConsent } from "./use-ai";
import { useCurrentChapter } from "./use-chapters";

/** The open tenant, as the role screens filter by it (#5933). */
export interface PermissionTenant {
  kind: "chapter" | "council";
  /** A council's model; `none` hides its `council-recruitment` keys. */
  recruitmentModel?: RecruitmentModel | null;
}

/**
 * Whether a permission's switch is left off the role and tier screens
 * because the feature it opens is not offered here: the AI permissions until
 * this server says it has AI (`aiAvailable` is `true`), and the Meetings ones
 * while the module is held off for the beta. The server's own catalog leaves
 * the AI ones out the same way (`RbacService.getPermissionsCatalog`); the
 * screens draw from the shared registry, so they need the same answer. An
 * officer can't use a switch for something nobody can open, and seeing one
 * reads as a feature that exists. The retired permissions
 * (`RETIRED_PERMISSIONS`, #5728) are left out everywhere: their switches
 * change nothing.
 *
 * One rule for web and the phone (#4504): each used to keep its own copy.
 *
 * The tenant's kind filters too, as the API's catalog does (#5933,
 * `school-layer.md` § 5.1): a chapter is offered no `council:` key, which its
 * role writes refuse; a council only its own keys (less the recruitment ones
 * under the `none` model) and the chapter keys it shares. Without a tenant,
 * the chapter rule.
 */
export function isPermissionHidden(
  permission: string,
  aiAvailable: boolean | undefined,
  tenant?: PermissionTenant,
): boolean {
  const outsideTenant =
    tenant?.kind === "council"
      ? !(
          COUNCIL_SHARED_PERMISSIONS.has(permission) ||
          (isCouncilPermission(permission) &&
            keysForRecruitmentModel(
              [permission],
              tenant.recruitmentModel ?? "none",
            ).length > 0)
        )
      : isCouncilPermission(permission);
  return (
    outsideTenant ||
    RETIRED_PERMISSIONS.has(permission) ||
    (permission.startsWith("ai:") && aiAvailable !== true) ||
    (permission.startsWith("meetings:") && isBetaOffModule("meetings"))
  );
}

/**
 * {@link isPermissionHidden}, with whether this server has AI read for you
 * and the open tenant's kind.
 */
export function useIsPermissionHidden(): (permission: string) => boolean {
  const aiAvailable = aiAvailableFrom(useAiConsent());
  const current = useCurrentChapter().data;
  const kind = current?.kind === "council" ? "council" : "chapter";
  const recruitmentModel = current?.recruitment_model ?? null;
  return useCallback(
    (permission: string) =>
      isPermissionHidden(permission, aiAvailable, { kind, recruitmentModel }),
    [aiAvailable, kind, recruitmentModel],
  );
}
