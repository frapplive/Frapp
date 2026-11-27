"use client";

import { describeLoadFailure } from "@repo/hooks/error-copy";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  type OrgDues,
  useCurrentChapter,
  aiAvailableFrom,
  isFirstAiReadInFlight,
  useAiConsent,
  useMyPermissions,
  useOrgConfig,
  usePatchOrgConfig,
  usePendingConfigKeys,
  useSemesterRollover,
  useSemesters,
  useRemoveChapterLogo,
  useUpdateChapter,
  useUploadChapterLogo,
  type ChapterLogoUpload,
  type SemesterArchive,
} from "@repo/hooks";
import {
  type GoalMetric,
  type PatchChapterConfig,
  PRIVACY_SETTINGS_COPY,
} from "@repo/validation";
import { memberViewVocabulary, titleCase, vocab } from "@repo/org-archetypes";
import { InlineNote } from "@/components/shared/inline-note";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  ErrorState,
  anyReadUncached,
  OfflineState,
  pausedRead,
} from "@/components/shared/async-states";
import { useConfirmDialog } from "@/components/shared/confirm-dialog";
import { useNetwork } from "@/lib/providers/network-provider";
import { useSubscriptionGate } from "@/components/shared/subscription-gate";
import { useToast } from "@/lib/hooks/use-toast";
import {
  can,
  canAll,
  CHAPTER_PROFILE_PERMISSIONS,
  isModuleEnabled as isStoredModuleEnabled,
} from "@repo/validation";
import { useChapterStore } from "@/lib/stores/chapter-store";
import { useTenantKind } from "@/lib/hooks/use-tenant-kind";
import { CouncilSettingsPage } from "@/components/councils/council-settings-page";
import { useChapterModuleGate } from "@/lib/hooks/use-chapter-module-gate";
import { asArray, getErrorMessage } from "@/lib/utils";
import { downscaleImage } from "@/lib/downscale-image";
import {
  isSettingsTabVisible,
  visibleSettingsTools,
  type SettingsTool,
} from "@/components/settings/settings-access";
import { SettingsGroup } from "@/components/shared/settings-row";
import {
  SETTINGS_TABS,
  SettingsNothingHere,
  SettingsRail,
  resolveSettingsTabParam,
} from "@/components/settings/settings-rail";
import {
  MODULE_GOAL_METRICS,
  goalPageId,
  isModuleSettingsTab,
  shownModuleSettings,
} from "@repo/hooks/module-settings";
import {
  chapterProfileSaveBody,
  readChapterBranding,
} from "@repo/hooks/chapter-tab";
import {
  ModuleSettingsPage,
  type ModulePage,
} from "@/components/settings/module-settings-page";
import {
  RUSH_READ_NOTES,
  RushModuleSettings,
  RushInterestFormPage,
  RushNotesAccess,
  RushStagesPage,
  RushTagsPage,
} from "@/components/settings/rush-module-settings";
import {
  AnnouncementsChannelGroup,
  ModuleToolsGroup,
} from "@/components/settings/module-settings-groups";
import {
  SettingsToolPage,
  SettingsToolSubpage,
} from "@/components/settings/settings-tool-views";
import {
  CHAT_REPORTS_ANCHOR,
  SETTINGS_SUBPAGE_PARAMS,
  chapterSettingsHref,
  isChapterSettingsPage,
  moduleSettingsHref,
  settingsSubpageFor,
} from "@/components/settings/settings-paths";
import { useSettingJump } from "@/lib/settings/use-setting-jump";
import { settingEntryById } from "@repo/hooks/settings-search";
import { rushPipelineAccess } from "@repo/hooks/rush-pipeline";
import {
  MeetingSectionsRow,
  MeetingSectionsRules,
} from "@/components/meetings/meeting-sections-rules";
import {
  DuesGraceRule,
  PointsRules,
  ServiceHoursRules,
} from "@/components/settings/module-rules";
import {
  ModuleGoals,
  ModuleGoalsGroup,
  goalPageTitle,
} from "@/components/settings/module-goals";
import {
  SettingsAccentTab,
  useAccentDraft,
} from "@/components/settings/settings-accent-tab";
import {
  SettingsSemesterTab,
  useRolloverForm,
} from "@/components/settings/settings-semester-tab";
import { PlanAndBilling } from "@/components/billing/plan-and-billing";
import { SettingsOrgTab } from "@/components/settings/settings-org-tab";
import { SettingsDuesTab } from "@/components/settings/settings-dues-tab";
import { SettingsRolesTab } from "@/components/settings/settings-roles-tab";
import { SettingsBirthdayPosts } from "@/components/settings/settings-birthday-posts";
import { SettingsMemberNames } from "@/components/settings/settings-member-names";
import { SettingsLogsTab } from "@/components/settings/settings-logs-tab";
import { SettingsPrivacyTab } from "@/components/settings/settings-privacy-tab";
import { SettingsAiTab } from "@/components/settings/settings-ai-tab";
import { SettingsFieldsTab } from "@/components/settings/settings-fields-tab";
import { SettingsClassesTab } from "@/components/settings/settings-classes-tab";
import {
  SettingsBodySkeleton,
  SettingsTabSkeleton,
} from "@/components/settings/settings-skeleton";

// Fallback shown before the config query resolves. Mirrors the API's
// chapter_dues_config defaults for an unconfigured chapter.
const DEFAULT_DUES: OrgDues = {
  cadence: "per_semester",
  active_amount_cents: 0,
  new_member_amount_cents: 0,
  alumni_amount_cents: 0,
  installments_allowed: false,
  installment_count: 1,
  late_fee_cents: 0,
  grace_days: 7,
  scholarship_pool_cents: 0,
};

/** The Chapter tab page a settings-search result lives on, if any. */
function chapterPageOfSetting(settingId: string | null): string | undefined {
  const web = settingEntryById(settingId)?.web;
  return web?.page === "org" ? web.params?.page : undefined;
}

/**
 * The page inside module page `moduleKey` a settings-search result lives on
 * (#6030), for a `?setting=` link made before the pages existed: a shipped
 * phone build opens `/settings?tab=points&setting=points-goal` with no
 * `page`, and the goal it names is on the Points goal page.
 */
function modulePageOfSetting(
  settingId: string | null,
  moduleKey: string,
): string | null {
  const web = settingEntryById(settingId)?.web;
  return web?.page === moduleKey ? (web.params?.page ?? null) : null;
}

function SettingsPageContent() {
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirmDialog();
  const { isOffline } = useNetwork();
  const activeChapterId = useChapterStore((s) => s.activeChapterId);
  const chapterQuery = useCurrentChapter({
    chapterId: activeChapterId,
    enabled: !!activeChapterId,
  });
  const orgConfigQuery = useOrgConfig();
  const {
    data: permissionsPayload,
    isError: permissionsFailed,
    error: permissionsError,
    fetchStatus: permissionsFetchStatus,
    refetch: refetchPermissions,
  } = useMyPermissions({
    enabled: !!activeChapterId,
  });
  const isModuleEnabled = useChapterModuleGate();
  // Whether this server has AI: the AI row shows only on `true` (#4308).
  const aiConsent = useAiConsent();
  const aiAvailable = aiAvailableFrom(aiConsent);
  const semestersQuery = useSemesters();
  const updateChapter = useUpdateChapter();
  const uploadLogo = useUploadChapterLogo();
  const removeLogo = useRemoveChapterLogo();
  const patchOrgConfig = usePatchOrgConfig();
  // Which settings are saving, not merely whether something is. One shared
  // `isPending` used to disable every control on every tab at once (#881).
  const pendingConfigKeys = usePendingConfigKeys();
  const rollover = useSemesterRollover();
  // Scoped to the rollover card; `SettingsSemesterTab` says why.
  const rolloverGate = useSubscriptionGate();

  const canManage = can(
    "chapter-config:manage",
    permissionsPayload?.permissions,
  );
  // The profile and accent saves go through `PATCH /v1/chapters/current`, which
  // guards on this constant; reading the same one keeps the page from enabling
  // a save the server refuses, or disabling one it accepts (#2575).
  const canEditProfile = canAll(
    CHAPTER_PROFILE_PERMISSIONS,
    permissionsPayload?.permissions,
  );

  // Deep-link the active tab via `?tab=` so links (e.g. the redirect from the
  // former standalone `/roles` page) can land directly on a tab.
  const searchParams = useSearchParams();
  // `?tab=theme` (Accent, folded into Chapter) resolves to `org`. The old
  // Modules list's `?tab=modules&module=<key>` opens that module's page.
  const moduleParam = searchParams.get("module");
  const requestedModuleKey =
    moduleParam && isModuleSettingsTab(moduleParam) ? moduleParam : undefined;
  const rawTabParam = searchParams.get("tab");
  const tabParam =
    rawTabParam === "modules" && requestedModuleKey
      ? requestedModuleKey
      : resolveSettingsTabParam(rawTabParam);
  const [activeTab, setActiveTab] = useState(tabParam ?? "org");
  useEffect(() => {
    if (tabParam) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- follow `?tab=` deep links without wiping a tab the member already picked
      setActiveTab(tabParam);
    }
  }, [tabParam]);
  /*
    A page opened inside a module page (#3837): one channel's settings
    (`?channel=`, the chat rail's Edit channel) or Discord import
    (`?tool=discord-import`), each drawn in place of the Chat page with a way
    back, so the rail stays on screen.
  */
  const channelParam = searchParams.get("channel");
  const toolParam = searchParams.get("tool");
  // A search result (`?setting=`) on one of the Chapter tab's pages opens that
  // page even from a link made before the pages existed, and the old Accent
  // tab (`?tab=theme`) opens Accent color. `?page=` is the Chapter tab's only
  // on that tab: another row's page (Plan and billing's, #6031) is that row's.
  const onChapterTab =
    rawTabParam === null || rawTabParam === "org" || rawTabParam === "theme";
  const pageParam =
    (onChapterTab ? searchParams.get("page") : null) ??
    chapterPageOfSetting(searchParams.get("setting")) ??
    (rawTabParam === "theme" ? "accent" : null);
  const chapterPage = isChapterSettingsPage(pageParam) ? pageParam : null;
  // A page opened from one of a module page's rows (#6030): a tool, a goal,
  // a rule's own page, one permission's Who can. The module page checks it
  // against its own pages, so an unknown one shows the module page.
  const modulePageParam = (moduleKey: string) =>
    searchParams.get("page") ??
    modulePageOfSetting(searchParams.get("setting"), moduleKey);
  // Write a page the address only implied into it, so it stays open once the
  // setting jump drops `?setting=`, and a refresh lands on it.
  useEffect(() => {
    if (!chapterPage) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("page") === chapterPage) return;
    url.searchParams.set("tab", "org");
    url.searchParams.set("page", chapterPage);
    window.history.replaceState(null, "", url.toString());
  }, [chapterPage]);
  // A new-report link from before the queue had a page of its own (#6031)
  // carried `#reported-messages` on the Chat page or on Chat admin: it opens
  // the queue's page.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.hash !== `#${CHAT_REPORTS_ANCHOR}`) return;
    if (url.searchParams.get("tab") !== "chat") return;
    if (url.searchParams.has("channel")) return;
    const page = url.searchParams.get("page");
    if (page !== null && page !== "chat-admin") return;
    url.searchParams.set("page", "reports");
    url.hash = "";
    window.history.replaceState(null, "", url.toString());
  }, []);
  // Switching rows starts the panel at its top, not wherever the last one
  // was scrolled to: the panel scrolls inside the shell's tool pane. The
  // address follows the row, without the params that opened a page inside
  // the last one, so Chat shows its own page when the officer comes back to
  // it, and a refresh or a copied link lands on the row they were on. Next
  // keeps `useSearchParams` in step with `replaceState`.
  const changeTab = useCallback((next: string) => {
    setActiveTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    for (const param of SETTINGS_SUBPAGE_PARAMS) url.searchParams.delete(param);
    url.hash = "";
    window.history.replaceState(null, "", url.toString());
    document.querySelector("[data-tool-page]")?.scrollTo?.({ top: 0 });
  }, []);

  /**
   * `?module=` lands an officer on that module's page with its switch
   * focused, which is how chat's ops-setup nudge (#492) sends them to turn a
   * module on. Validated against the module pages rather than passed
   * through.
   *
   * **Consumed once, not held for the visit.** `TabsContent` carries no
   * `forceMount`, so Radix unmounts the inactive page, and the tab is driven
   * by local state without rewriting the URL, so `?module=` survives the whole
   * visit. Without this latch, an officer who follows the nudge, wanders to
   * another row and comes back gets focus yanked to the switch every time.
   */
  const [consumedModuleKey, setConsumedModuleKey] = useState<string | null>(
    null,
  );
  const focusModuleKey =
    requestedModuleKey && consumedModuleKey !== requestedModuleKey
      ? requestedModuleKey
      : undefined;
  /*
    Latched by the switch that actually took focus, NOT by an effect up here.
    An effect on this component would fire on renders where the module page
    was never mounted — this function early-returns for "no active chapter"
    below, and again for the loading / offline / error banner — so a cold load
    (a pasted link, a refresh, open-in-new-tab, or just a slow first
    `useCurrentChapter`) would consume `?module=` while there was nothing to
    focus, and the officer would land at the top of the full module list. That
    is the exact thing this param exists to prevent, so the latch has to mean
    "focus was delivered", not "a render happened".

    State rather than a ref because `focusModuleKey` is read during render, and
    `react-hooks/refs` rightly forbids reading `ref.current` there.
  */
  const handleModuleFocused = useCallback(
    (key: string) => setConsumedModuleKey(key),
    [],
  );

  // `?setting=` from settings search: scroll to the setting and light it.
  useSettingJump();

  const accentDraft = useAccentDraft(chapterQuery.data);
  const rolloverForm = useRolloverForm();

  if (!activeChapterId) {
    return (
      <InlineNote>
        Select an active chapter to edit its organization, modules, and
        branding.
      </InlineNote>
    );
  }

  /*
    §4's flags, and the two things `/settings` was missing.

    `isPending` alone gated the spinner, but `useCurrentChapter` is
    `enabled: !!chapterId` and a paused query shares that flag — the
    no-chapter case is already handled by the card above, so what was left was
    a query paused offline spinning forever. And the route had **no offline
    state at all**, which is README §4 item 4 unmet on the only settings route
    the responsive-floor gate visits.

    The branches produce a value rather than returning, because
    `{confirmDialog}` has to outlive them: a background refetch failure landing
    while the rollover confirmation is open would otherwise unmount the dialog
    and settle its promise `null`, so the member's click on "Start new
    semester" would vanish with no toast and no error. `window.confirm` could
    not fail that way — it blocks the thread — so this is a cost the
    conversion introduces and has to pay for. Found by the pre-push review.
  */
  const chapterPaused = pausedRead(chapterQuery);
  let stateBanner: React.ReactNode = null;
  if (
    isOffline &&
    (anyReadUncached(chapterQuery) || permissionsPayload === undefined)
  ) {
    stateBanner = (
      <OfflineState
        title="Chapter settings unavailable offline"
        description="Reconnect to load this chapter's identity, modules, and branding."
        onRetry={() => {
          void chapterQuery.refetch();
          void refetchPermissions();
        }}
      />
    );
  } else if (chapterQuery.isLoading || chapterPaused) {
    stateBanner = <SettingsBodySkeleton />;
  } else if (chapterQuery.isError && chapterQuery.data === undefined) {
    // Only a first load that failed. A background refetch that fails keeps
    // the page it already drew: unmounting it would throw away a study zone
    // half drawn in the map editor, or an open delete confirmation.
    stateBanner = (
      <ErrorState
        title="Couldn't load chapter settings"
        description={`${describeLoadFailure(chapterQuery.error)} Changes here update every surface in the dashboard.`}
        onRetry={() => void chapterQuery.refetch()}
      />
    );
  } else if (permissionsPayload === undefined) {
    /*
      The tabs and tools below are filtered by the viewer's permissions, and
      while those are unknown there is nothing to draw: not an officer's rail
      for a member who arrived by URL (#3854), and not "Nothing in Chapter
      settings" for an officer whose read is still in flight. So the page holds
      its skeleton until the read answers. A failed read refuses to guess.
    */
    stateBanner =
      permissionsFailed && permissionsFetchStatus !== "fetching" ? (
        <ErrorState
          title="Couldn't load chapter settings"
          description={`${describeLoadFailure(permissionsError)} Your role decides what this page shows.`}
          onRetry={() => void refetchPermissions()}
        />
      ) : (
        <SettingsBodySkeleton />
      );
  } else if (isFirstAiReadInFlight(aiConsent)) {
    /*
      The same hold for the AI row (#4308): drawn without it and then
      inserted, it pushed every row below Privacy down and sent `?tab=ai` to
      the first tab. The read runs beside the permissions read, so the wait
      is rarely longer. A paused read, or a first attempt that failed, stops
      waiting and leaves the row out, as with AI off, without waiting out
      the retries (#4504).
    */
    stateBanner = <SettingsBodySkeleton />;
  }

  if (stateBanner) {
    return (
      <div className="space-y-6">
        {confirmDialog}
        {stateBanner}
      </div>
    );
  }

  // Read through the contract type, not a second schema: a whole-payload
  // parse emptied the profile form whenever one field (a malformed `branding`
  // key) failed it, and a DTO rename typechecked green and blanked a field
  // (#2844).
  const chapter = chapterQuery.data;
  const profile = {
    name: chapter?.name ?? "",
    university: chapter?.university ?? "",
    donation_url: chapter?.donation_url ?? "",
  };

  const config = orgConfigQuery.data;
  // A viewer the config read refuses still gets the chapter's own terms: a
  // `semester:rollover` holder without `chapter-config:view` reaches the
  // Semester tab (#2946), whose promotion copy names the chapter's pledge
  // role. The member view of the chapter carries `org_archetype` and
  // `vocabulary` as well, for exactly this kind of reader.
  const memberView = chapterQuery.data as
    | {
        org_archetype?: string | null;
        vocabulary?: Record<string, string> | null;
      }
    | undefined;
  const archetypeKey =
    config?.org_archetype ?? memberView?.org_archetype ?? "ifc";
  const vocabulary = config?.vocabulary ?? memberView?.vocabulary ?? {};
  // #351: this chapter's term for the pre-promotion role, e.g. "New Member"
  // (IFC default), "Aspirant" (NPHC), "Candidate" (professional) — the
  // rollover copy in `settings-semester-tab.tsx` promotes members holding
  // this role, so it should read in the chapter's own vocabulary rather than
  // the hardcoded IFC term.
  // Capitalized: the rollover copy uses it as a role-name reference
  // alongside "Member" (itself always capitalized), and `vocab()`'s own
  // defaults are sentence-case prose ("New member") rather than the title
  // case the seeded role is actually displayed with elsewhere (e.g. the
  // Discord-import role mapping step).
  // `memberViewVocabulary` lays the archetype's words under the chapter's: a
  // reader the config read refuses gets the member view's stored column as
  // it is, which can be `{}` (a chapter created without onboarding's seed) or
  // hold a cleared `""`, and either alone would name an NPHC chapter's
  // aspirants "New Member".
  const chapterWords = memberViewVocabulary({
    org_archetype: archetypeKey,
    vocabulary,
  });
  const pledgeTerm = titleCase(vocab("pledge", chapterWords));
  // The chapter's words for a pledge class and a member's order number, which
  // name the pledge class tab and everything in it (#3939).
  const classTerm = vocab("class", chapterWords);
  const orderTerm = vocab("order", chapterWords);
  // Key by key, so one malformed key doesn't empty the rest (#2844).
  const branding = readChapterBranding(config?.branding);
  const enabledModules = config?.enabled_modules;
  const workflows = config?.workflows ?? [];
  const dues = config?.dues ?? DEFAULT_DUES;
  const semesters = asArray<SemesterArchive>(semestersQuery.data);

  async function saveProfile(next: {
    name: string;
    university: string;
    donation_url: string;
  }) {
    // Only what the officer changed, so a name stored before the API's rule
    // never refuses an edit of the donation link.
    const body = chapterProfileSaveBody(profile, next);
    try {
      if (Object.keys(body).length > 0) {
        await updateChapter.mutateAsync(body);
      }
      toast({
        title: "Chapter profile saved",
        description: "Everyone sees the changes on their next refresh.",
      });
    } catch (error) {
      toast({
        title: "Couldn't save chapter profile",
        description: getErrorMessage(error, "Retry or check your connection."),
        variant: "destructive",
      });
    }
  }

  async function saveLogo(upload: ChapterLogoUpload) {
    try {
      // Stored at 512px for the crests that draw it (#2912).
      await uploadLogo.mutateAsync(
        await downscaleImage(upload, { keepAlpha: true }),
      );
      toast({
        title: "Logo saved",
        description: "An entry was written to the chapter audit log.",
      });
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
      toast({
        title: "Logo removed",
        description:
          "Your chapter mark falls back to its short name or letters.",
      });
    } catch (error) {
      toast({
        title: "Couldn't remove the logo",
        description: getErrorMessage(error, "Retry or check your connection."),
        variant: "destructive",
      });
    }
  }

  async function patchConfig(diff: PatchChapterConfig, successTitle: string) {
    try {
      await patchOrgConfig.mutateAsync(diff);
      toast({
        title: successTitle,
        description: "An entry was written to the chapter audit log.",
      });
    } catch (error) {
      toast({
        title: "Couldn't save settings",
        description: getErrorMessage(
          error,
          "Your change wasn't saved. Try again in a moment.",
        ),
        variant: "destructive",
      });
    }
  }

  function renderConfigGated(node: React.ReactNode) {
    if (orgConfigQuery.isPending) {
      return <SettingsTabSkeleton />;
    }
    if (orgConfigQuery.isError) {
      return (
        <ErrorState
          title="Couldn't load chapter configuration"
          description="The archetype, modules, and vocabulary couldn't be fetched. Retry to try again."
          onRetry={() => void orgConfigQuery.refetch()}
        />
      );
    }
    return node;
  }

  /**
   * A module page's own groups and the pages their rows open (#6030): its
   * Rules typed in place, its officer tools, its Goals, in that order, and
   * any line a Who can page carries. Rules and Goals read chapter config, so
   * they show only to a viewer who can read it; a tool shows to its holder.
   */
  function moduleContent(
    key: string,
    moduleTools: readonly SettingsTool[],
  ): {
    body: React.ReactNode;
    pages: ModulePage[];
    permissionNotes?: Record<string, React.ReactNode>;
  } {
    const href = (page: string) => moduleSettingsHref(key, page);
    const patchRules = (diff: PatchChapterConfig, title: string) =>
      patchConfig(diff, title);
    const pages: ModulePage[] = [];
    let rules: React.ReactNode = null;
    let goals: React.ReactNode = null;
    let permissionNotes: Record<string, React.ReactNode> | undefined;

    const goalsFor = (metrics: readonly GoalMetric[]) => {
      goals = <ModuleGoalsGroup metrics={metrics} pageHref={href} />;
      for (const metric of metrics) {
        pages.push({
          id: goalPageId(metric),
          title: goalPageTitle(metric),
          body: <ModuleGoals metrics={[metric]} canManage={canManage} />,
        });
      }
    };

    if (key === "hours" && canViewConfig) {
      rules = renderConfigGated(
        <ServiceHoursRules
          minutesPerPoint={config?.service?.minutes_per_point}
          workflows={workflows}
          canManage={canManage}
          savingRate={pendingConfigKeys.has("service")}
          savingWorkflows={pendingConfigKeys.has("workflows")}
          onPatch={patchRules}
        />,
      );
      goalsFor(MODULE_GOAL_METRICS.hours!);
    } else if (key === "points" && canViewConfig) {
      rules = renderConfigGated(
        <PointsRules
          points={config?.points}
          canManage={canManage}
          saving={pendingConfigKeys.has("points")}
          onPatch={patchRules}
        />,
      );
      goalsFor(MODULE_GOAL_METRICS.points!);
    } else if (key === "dues" && canViewConfig) {
      rules = renderConfigGated(
        <div className="space-y-4">
          <SettingsDuesTab
            dues={dues}
            canManage={canManage}
            isSaving={pendingConfigKeys.has("dues")}
            onSave={(next) => patchConfig({ dues: next }, "Dues saved")}
            pledgeTerm={pledgeTerm}
          />
          <DuesGraceRule
            workflows={workflows}
            canManage={canManage}
            saving={pendingConfigKeys.has("workflows")}
            onPatch={patchRules}
          />
        </div>,
      );
    } else if (key === "meetings" && canViewConfig) {
      rules = (
        <SettingsGroup heading="Rules">
          <MeetingSectionsRow href={href("sections")} />
        </SettingsGroup>
      );
      pages.push({
        id: "sections",
        title: "Sections in the minutes",
        body: <MeetingSectionsRules canManage={canManage} />,
      });
    } else if (key === "rush") {
      // Recruitment's stages, tags and picks read through the pipeline's own
      // routes, not the config.
      rules = (
        <RushModuleSettings
          moduleOn={moduleOn(key)}
          canSeeWhoCan={canSeeWhoCan}
          pageHref={href}
        />
      );
      // The stages and tags read through the pipeline's routes, which
      // refuse a viewer without rush:view and a chapter with Recruitment
      // off, so their pages exist only where their rows do.
      if (moduleOn(key) && rushPipelineAccess(permissions).view) {
        pages.push(
          {
            id: "interest-form",
            title: "Interest form",
            body: <RushInterestFormPage />,
          },
          { id: "stages", title: "Stages", body: <RushStagesPage /> },
          { id: "tags", title: "Tags", body: <RushTagsPage /> },
        );
      }
      if (canSeeWhoCan) {
        permissionNotes = {
          [RUSH_READ_NOTES]: (
            <RushNotesAccess canEditRoles={can("roles:manage", permissions)} />
          ),
        };
      }
    } else if (key === "announcements") {
      rules = <AnnouncementsChannelGroup canOpen={holdsTool("chat-admin")} />;
    }

    // Every tool but Discord import opens as this page's own page; Discord
    // import keeps `?tool=`, which its consent screen comes back to.
    for (const tool of moduleTools) {
      if (tool.id === "discord-import") continue;
      pages.push({
        id: tool.id,
        title: tool.label,
        body: <SettingsToolPage toolId={tool.id} />,
      });
    }

    return {
      body: (
        <>
          {rules}
          <ModuleToolsGroup
            tools={moduleTools}
            hrefOf={(tool) =>
              tool.id === "discord-import" ? tool.href : href(tool.id)
            }
          />
          {goals}
        </>
      ),
      pages,
      permissionNotes,
    };
  }

  /*
    Settings shows each viewer only what they can use (#2946). The chapter
    menu's Chapter settings link admits anyone Settings holds a tab or an officer tool for
    (`hasSettingsDestination`), so a treasurer who holds only reports:export
    arrives here too. Before, every setup tab rendered for everyone and the
    config-gated ones answered a non-holder with "Couldn't load chapter
    configuration".
  */
  const permissions = permissionsPayload?.permissions;
  const tools = visibleSettingsTools(permissions, isModuleEnabled);
  /*
    A module's switch, as `ChapterGuard` enforces it (#3028). The config read
    answers for a config viewer; a viewer it refuses (a treasurer reaching
    Reports through `reports:export`) reads the member view's gate, which
    applies the same `isModuleEnabled`. Unresolved reads say on, like the
    nav, so no row flashes "Off".
  */
  const moduleOn = (key: string): boolean => {
    if (enabledModules) return isStoredModuleEnabled(enabledModules, key);
    return isModuleEnabled ? isModuleEnabled(key) : true;
  };
  const visibleTabs = SETTINGS_TABS.filter(
    (tab) =>
      isSettingsTabVisible(tab.value, permissions, isModuleEnabled) &&
      // The AI row waits for the server to say it has AI (#4308).
      (tab.value !== "ai" || aiAvailable === true),
  ).map((tab) => {
    if (tab.value === "classes") return { ...tab, label: classTerm };
    if (isModuleSettingsTab(tab.value)) {
      return { ...tab, off: !moduleOn(tab.value) };
    }
    return tab;
  });
  const canViewConfig = can("chapter-config:view", permissions);
  const canSeeWhoCan = can("members:view", permissions);
  const holdsTool = (id: string) => tools.some((tool) => tool.id === id);
  // A page opened in place of a module page (#3837): a channel's settings or
  // Discord import, inside Chat.
  const subpageFor = (key: string) =>
    settingsSubpageFor(
      key,
      {
        channel: channelParam,
        tool: toolParam,
        page: searchParams.get("page"),
      },
      holdsTool,
    );

  // A `?tab=` deep link to a tab this viewer does not get, or the default
  // `org` for someone with no setup tabs, lands on the first tab they do get.
  const shownTab = visibleTabs.some((tab) => tab.value === activeTab)
    ? activeTab
    : (visibleTabs[0]?.value ?? "");

  if (visibleTabs.length === 0) {
    return (
      <div className="space-y-6">
        {confirmDialog}
        <SettingsNothingHere />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/*
        Above the tabs, so switching tab never unmounts an open confirmation
        mid-flight — `ConfirmDialogHost` would settle it `null` and the
        rollover would silently not run. Same reason the Chapter Ops slice
        keeps `{confirmDialog}` out from under its screens' early returns.
      */}
      {confirmDialog}
      {/*
        No description paragraph. "Configure your organization identity,
        modules, branding, and chapter administration" restated the rail
        immediately under it — `1f` pin 2 gives a route's body one toolbar row
        with "no wrapper card, no description paragraph", and lane 4 and lane 5
        deleted the same sentence off four other routes.
      */}
      {/*
        One layout for every row (#3713): the rail at its fixed 200px, sticky,
        and the panel beside it at one width whichever row is open, so nothing
        moves sideways when the officer switches rows. Chapter settings has the
        whole width: chat closes beside it (decision 3 of #4068,
        `isFullWidthToolRoute`).
      */}
      <Tabs
        value={shownTab}
        onValueChange={changeTab}
        className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10"
      >
        <SettingsRail
          visibleTabs={visibleTabs}
          onRowClick={(value) => {
            // The lit row closes a page opened inside it (a channel's
            // settings, Discord import, the plan table) and goes back to the
            // row's own page.
            if (
              value === shownTab &&
              (channelParam || toolParam || searchParams.get("page"))
            ) {
              changeTab(value);
            }
          }}
        />

        <div className="w-full min-w-0 max-w-[960px] flex-1">
          <TabsContent value="org" className="mt-0">
            {renderConfigGated(
              <SettingsOrgTab
                archetypeKey={archetypeKey}
                vocabulary={vocabulary}
                branding={branding}
                profile={profile}
                mark={{
                  logoUrl: chapterQuery.data?.logo_url ?? null,
                  onUploadLogo: saveLogo,
                  onRemoveLogo: deleteLogo,
                  logoPending: uploadLogo.isPending || removeLogo.isPending,
                }}
                canManage={canManage}
                canEditProfile={canEditProfile}
                page={chapterPage}
                pageHref={chapterSettingsHref}
                onSaveProfile={saveProfile}
                onPatchConfig={(diff) =>
                  patchConfig(diff, "Organization settings saved")
                }
                savingProfile={updateChapter.isPending}
                savingConfig={
                  pendingConfigKeys.has("branding") ||
                  pendingConfigKeys.has("vocabulary") ||
                  pendingConfigKeys.has("org_archetype")
                }
                accentSection={
                  <SettingsAccentTab
                    draft={accentDraft}
                    canEditProfile={canEditProfile}
                    updateChapter={updateChapter}
                    orgName={chapter?.name}
                  />
                }
              />,
            )}
            {config && !chapterPage ? (
              <div className="mt-10">
                <SettingsBirthdayPosts
                  channelId={
                    typeof config.birthday_channel_id === "string"
                      ? config.birthday_channel_id
                      : null
                  }
                  canManage={canManage}
                  isSaving={pendingConfigKeys.has("birthday_channel_id")}
                  onChange={(birthdayChannelId) =>
                    patchConfig(
                      { birthday_channel_id: birthdayChannelId },
                      birthdayChannelId
                        ? "Birthday posts on"
                        : "Birthday posts off",
                    )
                  }
                />
              </div>
            ) : null}
            {config && !chapterPage ? (
              <div className="mt-10">
                <SettingsMemberNames
                  enabled={config.members_can_change_name === true}
                  canManage={canManage}
                  isSaving={pendingConfigKeys.has("members_can_change_name")}
                  onChange={(enabled) =>
                    patchConfig(
                      { members_can_change_name: enabled },
                      enabled
                        ? "Members can change their own name"
                        : "Member names locked",
                    )
                  }
                />
              </div>
            ) : null}
          </TabsContent>
          {/*
            Board `4d` gives Semester its own rail entry. It used to be two
            cards at the bottom of Organization, under the chapter profile and
            above the danger card — three unrelated jobs on one tab, which is
            why the tab needed a sentence explaining itself.
          */}
          <TabsContent value="semester" className="mt-0">
            <SettingsSemesterTab
              form={rolloverForm}
              pledgeTerm={pledgeTerm}
              confirm={confirm}
              rollover={rollover}
              rolloverGate={rolloverGate}
              semesters={semesters}
              semestersPending={semestersQuery.isPending}
              page={searchParams.get("page")}
            />
          </TabsContent>

          {/*
            Plan and billing (#3827): the old `/billing` route, gated on
            `billing:view` like the sidebar row it replaces. No config gate:
            it reads the billing record and invoices, not chapter config.
          */}
          <TabsContent value="billing" className="mt-0">
            <PlanAndBilling page={searchParams.get("page")} />
          </TabsContent>

          {/*
            **Deliberately not `renderConfigGated`.** A `roles:manage` holder
            without `chapter-config:view` reaches this tab: the chapter menu's
            Chapter settings item admits `roles:manage` on its own (`settings-access.ts`), and
            `/roles` redirects here. This page's config read is gated on
            `chapter-config:view`, so gating the tab on it would land that
            member on "Couldn't load chapter configuration", which is what
            happened while the nav had a Roles row of its own (#2946 folded it
            into Settings). That combination is freely constructible from the
            tier permission pages below.

            It does not need the gate: the roles pages read `useRoles` and
            `useRoleTiers`, neither of which is chapter config. Only
            the default-invite-role picker is, and it degrades on its own —
            `configUnavailable` hides that one control rather than the tab.
          */}
          <TabsContent value="roles" className="mt-0">
            <SettingsRolesTab
              canManage={canManage}
              // Pending as well as error. `renderConfigGated` used to block on
              // both; covering only the error case would render the
              // default-invite-role picker as "No default" while the config
              // read is still in flight, which is indistinguishable from a
              // chapter that never set one — and picking a role there would
              // overwrite the real default the response was about to deliver.
              configUnavailable={
                orgConfigQuery.isError || orgConfigQuery.isPending
              }
              defaultInviteRoleId={config?.default_invite_role_id ?? null}
              isSavingConfig={pendingConfigKeys.has("default_invite_role_id")}
              onSaveDefaultInviteRole={(roleId) =>
                patchConfig(
                  { default_invite_role_id: roleId },
                  "Default invite role saved",
                )
              }
            />
          </TabsContent>

          {/*
            No config gate: the tab reads the pledge class list and the
            roster, neither of which is chapter config, and its words fall
            back to the member view's vocabulary.
          */}
          <TabsContent value="classes" className="mt-0">
            <SettingsClassesTab
              canManage={can("roles:manage", permissions)}
              classTerm={classTerm}
              orderTerm={orderTerm}
            />
          </TabsContent>

          <TabsContent value="fields" className="mt-0">
            {renderConfigGated(<SettingsFieldsTab canManage={canManage} />)}
          </TabsContent>

          {/*
            One page per module (#4073). The switch and "who can" read no
            config a tool-only viewer lacks the way rules do, so only the
            rules wait on the config read.
          */}
          {shownModuleSettings().map((module) => {
            const subpage = subpageFor(module.key);
            const content = moduleContent(
              module.key,
              tools.filter((tool) => tool.page === module.key),
            );
            return (
              <TabsContent key={module.key} value={module.key} className="mt-0">
                {subpage ? (
                  <SettingsToolSubpage subpage={subpage} />
                ) : (
                  <ModuleSettingsPage
                    module={module}
                    on={moduleOn(module.key)}
                    canManage={canManage}
                    switchPending={pendingConfigKeys.has(
                      `enabled_modules.${module.key}`,
                    )}
                    onToggle={(enabled) =>
                      patchConfig(
                        { enabled_modules: { [module.key]: enabled } },
                        enabled
                          ? `${module.label} turned on`
                          : `${module.label} turned off`,
                      )
                    }
                    body={content.body}
                    pages={content.pages}
                    page={modulePageParam(module.key)}
                    pageHref={(page) => moduleSettingsHref(module.key, page)}
                    permissionNotes={content.permissionNotes}
                    canSeeWhoCan={canSeeWhoCan}
                    canEditRoles={can("roles:manage", permissions)}
                    focusSwitch={focusModuleKey === module.key}
                    onSwitchFocused={handleModuleFocused}
                  />
                )}
              </TabsContent>
            );
          })}
          {/*
            Logs (Paul, 2026-11-21): no config gate, since it reads the audit
            log, not chapter config; the rail shows it only to a viewer the
            route admits (`isSettingsTabVisible`).
          */}
          <TabsContent value="logs" className="mt-0">
            <SettingsLogsTab />
          </TabsContent>
          <TabsContent value="ai" className="mt-0">
            <SettingsAiTab />
          </TabsContent>
          <TabsContent value="privacy" className="mt-0">
            {renderConfigGated(
              <SettingsPrivacyTab
                analyticsOptOut={config?.analytics_opt_out === true}
                canManage={canManage}
                isSaving={pendingConfigKeys.has("analytics_opt_out")}
                onToggle={(optOut) =>
                  patchConfig(
                    { analytics_opt_out: optOut },
                    optOut
                      ? PRIVACY_SETTINGS_COPY.turnedOff
                      : PRIVACY_SETTINGS_COPY.turnedOn,
                  )
                }
              />,
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// `SettingsPageContent` reads `?tab=` via `useSearchParams`, which Next requires
// to sit under a Suspense boundary (matches the sign-in/sign-up/join pattern).
export function SettingsPage() {
  const activeChapterId = useChapterStore((s) => s.activeChapterId);
  const tenantKind = useTenantKind();
  const chapterRead = useCurrentChapter({
    chapterId: activeChapterId,
    enabled: !!activeChapterId,
  });
  // Held only while the read is actually running: a paused or failed one
  // falls through to the chapter page, which says it is offline or failed.
  const kindLoading =
    !!activeChapterId &&
    tenantKind === undefined &&
    chapterRead.fetchStatus === "fetching";
  return (
    <>
      <Suspense fallback={<SettingsBodySkeleton />}>
        {
          // A council's settings are its own few rows (#5933). Its kind is
          // read before either page mounts, so the chapter page's config,
          // semester and AI reads never go to a council's routes.
          kindLoading ? (
            <SettingsBodySkeleton />
          ) : tenantKind === "council" ? (
            <CouncilSettingsPage />
          ) : (
            <SettingsPageContent />
          )
        }
      </Suspense>
    </>
  );
}
