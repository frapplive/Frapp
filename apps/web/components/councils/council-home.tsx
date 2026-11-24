"use client";

import { useMemo } from "react";
import { useCouncil, useCurrentChapter } from "@repo/hooks";
import { can } from "@repo/validation";
import { chapterMarkFor, CrestTile } from "@/components/layout/crest-tile";
import { InviteMemberDialog } from "@/components/members/invite-member-dialog";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";
import { Badge } from "@/components/ui/badge";
import { useNavPermissions } from "@/lib/hooks/use-nav-permissions";
import { councilTypeLabel } from "@/lib/hooks/use-tenant-kind";
import { useChapterStore } from "@/lib/stores/chapter-store";
import { COUNCIL_HOME_COPY } from "@/components/councils/council-copy";

/**
 * A council's home view (#5933): what the shell shows with nothing open,
 * where a chapter shows its crest and school (`chapter-home.tsx`). The same
 * crest on the same accent glow, then what a council is that a chapter isn't:
 * its type and school, and whether Frapp has verified it yet. Every council
 * starts unverified (`school-layer.md` § 5.3).
 *
 * Under that, the first two things its officers do, each opening where the
 * work is done: Invite delegates opens the Directory's own invite panel in
 * place, and Edit titles opens Roles and groups in Council settings, where
 * every seeded title renames. Each shows only to a role that can do it, so a
 * delegate's home is the council's identity alone. A Discord server's "Invite
 * your friends" and "Personalize your server" checklist, without the
 * checklist chrome.
 */
export function CouncilHome() {
  const activeChapterId = useChapterStore((s) => s.activeChapterId);
  const { data: chapter } = useCurrentChapter({
    chapterId: activeChapterId,
    enabled: !!activeChapterId,
  });
  const { data: council } = useCouncil(activeChapterId);
  const permissions = useNavPermissions();
  const mark = useMemo(
    () => (chapter ? chapterMarkFor(chapter) : null),
    [chapter],
  );

  const name = council?.name ?? chapter?.name;
  const type = councilTypeLabel(council?.council_type ?? chapter?.council_type);
  const school = council?.school?.name ?? chapter?.university ?? null;
  const subtitle = [type, school].filter(Boolean).join(" · ");
  const canInvite = can("members:invite", permissions);
  const canEditTitles = can("roles:manage", permissions);

  return (
    <section
      aria-label="Home"
      data-chapter-home=""
      data-council-home=""
      className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden bg-background px-6 text-center"
    >
      {/* The glow: the council's accent, soft, behind the mark. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-text opacity-[0.14] blur-[120px]"
      />
      {mark && name ? (
        <div className="relative flex w-full max-w-[400px] flex-col items-center gap-5">
          <CrestTile mark={mark} size="home" />
          <div className="flex flex-col items-center gap-1">
            <h2 className="text-2xl font-semibold text-foreground">{name}</h2>
            {subtitle ? (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
            {council && !council.verified ? (
              <Badge variant="warning" className="mt-2">
                {COUNCIL_HOME_COPY.unverified}
              </Badge>
            ) : null}
          </div>
          {canInvite || canEditTitles ? (
            <SettingsGroup
              label={COUNCIL_HOME_COPY.nextLabel}
              className="w-full text-left"
            >
              {canInvite ? (
                <InviteMemberDialog
                  trigger={
                    <SettingsRow
                      label={COUNCIL_HOME_COPY.invite}
                      value={null}
                      onClick={() => undefined}
                    />
                  }
                />
              ) : null}
              {canEditTitles ? (
                <SettingsRow
                  label={COUNCIL_HOME_COPY.titles}
                  href="/settings?tab=roles"
                />
              ) : null}
            </SettingsGroup>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
