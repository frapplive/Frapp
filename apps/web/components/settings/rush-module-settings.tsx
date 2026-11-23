"use client";

import { useState } from "react";
import {
  rushPipelineAccess,
  useMyPermissions,
  useRushPipeline,
} from "@repo/hooks";
import { isWildcardRole, mayGrant, reachesTier } from "@repo/hooks/role-tiers";
import { ProfileSection } from "@/components/profile/profile-section";
import { InlineNote } from "@/components/shared/inline-note";
import { Button } from "@/components/ui/button";
import { useTierPermissionToggle } from "@/components/roles/use-role-permission-toggle";
import { useRolesData } from "@/components/roles/use-roles-data";
import { RushStageEditor } from "./rush-stage-editor";
import { RushTagList } from "./rush-tag-list";

/** The key that lets a role read recruitment notes. */
export const RUSH_READ_NOTES = "rush:read_notes";

/**
 * The pipeline's settings on the Recruitment module page (#5924,
 * `spec/behavior/ifc-recruitment.md` § Where the chapter's settings live):
 * its stages, its tags, and turning notes on for a chapter where nobody can
 * read them yet. One page, no second recruitment settings screen. The
 * stages and tags read through the pipeline's routes, so they show only to a
 * viewer who can open the pipeline while the module is on; `rush:manage`
 * edits them.
 */
export function RushModuleSettings({
  moduleOn,
  canEditRoles,
  canSeeWhoCan,
}: {
  moduleOn: boolean;
  /** `roles:manage`, the guard on the tier write. */
  canEditRoles: boolean;
  /** `members:view`, which reading the chapter's roles needs. */
  canSeeWhoCan: boolean;
}) {
  const permissions = useMyPermissions().data?.permissions;
  const access = rushPipelineAccess(permissions);
  const pipeline = useRushPipeline({ enabled: moduleOn && access.view });

  return (
    <div className="space-y-10">
      {moduleOn && access.view ? (
        pipeline.data ? (
          <>
            <RushStageEditor
              stages={pipeline.data.stages}
              canEdit={access.manage}
            />
            <RushTagList tags={pipeline.data.tags} canEdit={access.manage} />
          </>
        ) : pipeline.isError ? (
          <InlineNote>Couldn&apos;t load the stages and tags.</InlineNote>
        ) : null
      ) : null}
      {canSeeWhoCan ? <RushNotesAccess canEditRoles={canEditRoles} /> : null}
    </div>
  );
}

/**
 * "Nobody can read recruitment notes yet", for a chapter where no tier and
 * no role holds `rush:read_notes` (the President's `*` doesn't count: it
 * isn't a grant anyone chose). New chapters start with it on for their top
 * two tiers; an existing chapter turns it on here, in one press, for the
 * same two (`spec/behavior/ifc-recruitment.md` § Notes). Once anyone holds
 * it the line goes, and the Who can block below says who.
 *
 * The write is a tier's permission list (`useTierPermissionToggle`), so it
 * needs `roles:manage` and the rank rules: the button is dimmed with the
 * reason when the viewer can't make it.
 */
export function RushNotesAccess({ canEditRoles }: { canEditRoles: boolean }) {
  const { rolesQuery, tiersQuery, roles, tiers, reach, words } = useRolesData();
  const toggle = useTierPermissionToggle(tiers);
  const [granting, setGranting] = useState(false);
  if (rolesQuery.isPending || tiersQuery.isPending) return null;
  if (rolesQuery.isError || tiersQuery.isError) return null;

  const held =
    tiers.some((tier) =>
      toggle.permissionsOf(tier).includes(RUSH_READ_NOTES),
    ) ||
    roles.some(
      (role) =>
        !isWildcardRole(role) && role.permissions.includes(RUSH_READ_NOTES),
    );
  if (held) return null;

  const top = [...tiers].sort((a, b) => a.position - b.position).slice(0, 2);
  const why =
    top.length === 0
      ? `Your chapter has no ${words.plural} yet.`
      : !canEditRoles
        ? "Your role can't change roles."
        : !mayGrant(reach, RUSH_READ_NOTES) ||
            !top.every((tier) => reachesTier(reach, tier))
          ? "Only the President can turn this on."
          : null;

  async function grant() {
    setGranting(true);
    try {
      for (const tier of top) {
        await toggle.toggle(tier, RUSH_READ_NOTES, false);
      }
    } finally {
      setGranting(false);
    }
  }

  return (
    <ProfileSection id="settings-module-rush-notes" title="Notes">
      <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-foreground">
          Nobody can read recruitment notes yet.
        </p>
        <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={why !== null || granting}
            title={why ?? undefined}
            onClick={() => void grant()}
          >
            Let the top two {words.plural} read them
          </Button>
          {why ? (
            <span className="text-caption text-muted-foreground">{why}</span>
          ) : null}
        </div>
      </div>
    </ProfileSection>
  );
}
