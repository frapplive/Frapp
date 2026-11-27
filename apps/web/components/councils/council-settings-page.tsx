"use client";

import { pushAddress } from "@/lib/address/address";
import { useCallback, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  useCouncil,
  useCurrentChapter,
  useMyPermissions,
  useRemoveChapterLogo,
  useUpdateChapter,
  useUploadChapterLogo,
  type ChapterLogoUpload,
} from "@repo/hooks";
import { describeLoadFailure } from "@repo/hooks/error-copy";
import {
  CHAPTER_PROFILE_PERMISSIONS,
  COUNCIL_NAME_MAX,
  can,
  canAll,
} from "@repo/validation";
import { chapterMarkFor, CrestTile } from "@/components/layout/crest-tile";
import { ProfileSection } from "@/components/profile/profile-section";
import { ErrorState } from "@/components/shared/async-states";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  SettingsAccentTab,
  useAccentDraft,
} from "@/components/settings/settings-accent-tab";
import { ChapterLogoField } from "@/components/settings/settings-chapter-mark-card";
import { isSettingsTabVisible } from "@/components/settings/settings-access";
import { SettingsLogsTab } from "@/components/settings/settings-logs-tab";
import {
  SettingsNothingHere,
  SettingsRail,
  type SettingsTab,
} from "@/components/settings/settings-rail";
import { SettingsRolesTab } from "@/components/settings/settings-roles-tab";
import { SettingsBodySkeleton } from "@/components/settings/settings-skeleton";
import { useToast } from "@/lib/hooks/use-toast";
import { councilTypeLabel } from "@/lib/hooks/use-tenant-kind";
import { downscaleImage } from "@/lib/downscale-image";
import { useChapterStore } from "@/lib/stores/chapter-store";
import { getErrorMessage } from "@/lib/utils";
import { CHAPTER_LOGS_TITLE } from "@repo/validation";
import { COUNCIL_SETTINGS_COPY as COPY } from "@/components/councils/council-copy";

/**
 * A council's rows, in the chapter rail's groups (#5933). Only what a council
 * can change: its profile (name, logo, accent, through
 * `PATCH /v1/chapters/current` and the logo routes, which serve a council),
 * its Logs, and Roles and groups. The chapter's other rows read chapter
 * config, semesters, billing or pledge classes, whose routes refuse a council.
 */
export const COUNCIL_SETTINGS_TABS: readonly SettingsTab[] = [
  { value: "council", label: COPY.tab, group: "chapter" },
  { value: "logs", label: CHAPTER_LOGS_TITLE, group: "chapter" },
  { value: "roles", label: "Roles and groups", group: "people" },
];

/** Old and chapter `?tab=` values that land on a council row. */
const TAB_ALIASES: Readonly<Record<string, string>> = {
  org: "council",
  theme: "council",
  groups: "roles",
};

/** Whether a council row shows for this viewer. */
export function isCouncilSettingsTabVisible(
  tab: string,
  permissions: readonly string[] | null | undefined,
): boolean {
  if (permissions === undefined || permissions === null) return false;
  if (tab === "council")
    return canAll(CHAPTER_PROFILE_PERMISSIONS, permissions);
  return isSettingsTabVisible(tab, permissions);
}

/**
 * Council settings (#5933): the chapter's Settings layout, rail and panel,
 * with a council's rows. Discord's server settings and Slack's workspace
 * settings put the same three things first: the name and icon, the roles,
 * and the audit log.
 */
export function CouncilSettingsPage() {
  const activeChapterId = useChapterStore((s) => s.activeChapterId);
  const chapterQuery = useCurrentChapter({
    chapterId: activeChapterId,
    enabled: !!activeChapterId,
  });
  const permissionsQuery = useMyPermissions({ enabled: !!activeChapterId });
  const permissions = permissionsQuery.data?.permissions;
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tabParam = rawTab ? (TAB_ALIASES[rawTab] ?? rawTab) : null;
  // The address is the tab: a rail row pushes `?tab=`, so Back walks the
  // rows visited and a reload lands on the one open (#6049).
  const activeTab = tabParam ?? "council";
  const changeTab = useCallback((next: string) => {
    pushAddress({ tab: next, tier: null, role: null });
    document.querySelector("[data-tool-page]")?.scrollTo?.({ top: 0 });
  }, []);

  if (chapterQuery.isError && !chapterQuery.data) {
    return (
      <ErrorState
        title="Couldn't load council settings"
        description={describeLoadFailure(chapterQuery.error)}
        onRetry={() => void chapterQuery.refetch()}
      />
    );
  }
  if (!chapterQuery.data || permissions === undefined) {
    return <SettingsBodySkeleton />;
  }

  const visibleTabs = COUNCIL_SETTINGS_TABS.filter((tab) =>
    isCouncilSettingsTabVisible(tab.value, permissions),
  );
  if (visibleTabs.length === 0) return <SettingsNothingHere council />;
  const shownTab = visibleTabs.some((tab) => tab.value === activeTab)
    ? activeTab
    : visibleTabs[0]!.value;

  return (
    <Tabs
      value={shownTab}
      onValueChange={changeTab}
      // Arrow keys move focus along the rail; Enter or a click opens a row,
      // so each step Back returns from is one the member chose (#6049).
      activationMode="manual"
      className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10"
    >
      <SettingsRail
        visibleTabs={visibleTabs}
        groupLabels={{ chapter: COPY.group }}
        search={false}
      />
      <div className="w-full min-w-0 max-w-[960px] flex-1">
        <TabsContent value="council" className="mt-0">
          <CouncilProfileTab />
        </TabsContent>
        <TabsContent value="logs" className="mt-0">
          <SettingsLogsTab />
        </TabsContent>
        <TabsContent value="roles" className="mt-0">
          <SettingsRolesTab
            canManage={can("chapter-config:manage", permissions)}
            // A council has no chapter config, so no default invite role to
            // pick: its invites land on Delegate, the `MEMBER` floor.
            configUnavailable
            defaultInviteRoleId={null}
            isSavingConfig={false}
            onSaveDefaultInviteRole={() => undefined}
          />
        </TabsContent>
      </div>
    </Tabs>
  );
}

/** Council: its profile rows, its logo and its accent. */
function CouncilProfileTab() {
  const { toast } = useToast();
  const activeChapterId = useChapterStore((s) => s.activeChapterId);
  const { data: chapter } = useCurrentChapter({
    chapterId: activeChapterId,
    enabled: !!activeChapterId,
  });
  const { data: council } = useCouncil(activeChapterId);
  const updateChapter = useUpdateChapter();
  const uploadLogo = useUploadChapterLogo();
  const removeLogo = useRemoveChapterLogo();
  const accentDraft = useAccentDraft(chapter);
  const permissions = useMyPermissions().data?.permissions;
  const canEdit = canAll(CHAPTER_PROFILE_PERMISSIONS, permissions);
  if (!chapter) return null;

  const mark = chapterMarkFor(chapter);
  const logoUrl = (chapter as { logo_url?: string | null }).logo_url ?? null;
  const type = councilTypeLabel(council?.council_type ?? chapter.council_type);
  const school = council?.school?.name ?? chapter.university ?? null;

  async function saveLogo(upload: ChapterLogoUpload) {
    try {
      // Stored at 512px for the crests that draw it (#2912).
      await uploadLogo.mutateAsync(
        await downscaleImage(upload, { keepAlpha: true }),
      );
    } catch (error) {
      toast({
        title: "Couldn't upload the logo",
        description: getErrorMessage(error, "Retry or check your connection."),
        variant: "destructive",
      });
    }
  }

  async function deleteLogo() {
    try {
      await removeLogo.mutateAsync();
    } catch (error) {
      toast({
        title: "Couldn't remove the logo",
        description: getErrorMessage(error, "Retry or check your connection."),
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-10">
      <ProfileSection id="settings-council-profile" title={COPY.profile}>
        <SettingsGroup>
          <SettingsRow
            label={COPY.name}
            control={
              <CouncilNameField
                stored={chapter.name}
                disabled={!canEdit}
                onSave={async (name) => {
                  await updateChapter.mutateAsync({ name });
                }}
              />
            }
          />
          {type ? (
            <SettingsRow
              label={COPY.type}
              control={
                <span className="text-sm text-muted-foreground">{type}</span>
              }
            />
          ) : null}
          {school ? (
            <SettingsRow
              label={COPY.school}
              control={
                <span className="text-sm text-muted-foreground">{school}</span>
              }
            />
          ) : null}
          {council ? (
            <SettingsRow
              label={COPY.status}
              control={
                council.verified ? (
                  <Badge variant="success">{COPY.verified}</Badge>
                ) : (
                  <Badge variant="warning">{COPY.unverified}</Badge>
                )
              }
            />
          ) : null}
        </SettingsGroup>
      </ProfileSection>

      <ProfileSection id="settings-council-logo" title={COPY.logo}>
        <div className="flex flex-wrap items-center gap-4">
          <CrestTile mark={mark} />
          <ChapterLogoField
            logoUrl={logoUrl}
            canEditLogo={canEdit}
            onUploadLogo={saveLogo}
            onRemoveLogo={deleteLogo}
            logoPending={uploadLogo.isPending || removeLogo.isPending}
            showLabel={false}
            hint={
              canEdit ? null : (
                <p className="text-caption text-muted-foreground">
                  {COPY.noAccess}
                </p>
              )
            }
          />
        </div>
      </ProfileSection>

      <SettingsAccentTab
        draft={accentDraft}
        canEditProfile={canEdit}
        updateChapter={updateChapter}
      />
    </div>
  );
}

/**
 * The council's name, saved on Enter or on leaving the field with a quiet
 * "Saved", and put back by Escape (rulebook § 9: settings save on their own).
 */
export function CouncilNameField({
  stored,
  disabled,
  onSave,
}: {
  stored: string;
  disabled: boolean;
  onSave: (name: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);
  const skipBlur = useRef(false);
  const value = draft ?? stored;

  async function commit() {
    if (draft === null) return;
    const next = draft.trim();
    if (next === stored) {
      setDraft(null);
      return;
    }
    if (!next) {
      setState("error");
      setMessage(COPY.nameRequired);
      return;
    }
    setState("saving");
    setMessage(null);
    try {
      await onSave(next);
      setDraft(null);
      setState("saved");
    } catch (error) {
      setState("error");
      setMessage(getErrorMessage(error, COPY.saveFailed));
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span
        aria-live="polite"
        className={
          state === "error"
            ? "text-caption text-destructive"
            : "text-caption text-muted-foreground"
        }
      >
        {state === "saved" ? COPY.saved : state === "error" ? message : null}
      </span>
      <Input
        aria-label={COPY.name}
        value={value}
        maxLength={COUNCIL_NAME_MAX}
        disabled={disabled || state === "saving"}
        aria-invalid={state === "error" ? true : undefined}
        className="w-64"
        onChange={(event) => {
          setDraft(event.target.value);
          setState("idle");
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            skipBlur.current = true;
            setDraft(null);
            setState("idle");
            event.currentTarget.blur();
          }
        }}
        onBlur={() => {
          if (skipBlur.current) {
            skipBlur.current = false;
            return;
          }
          void commit();
        }}
      />
    </div>
  );
}
