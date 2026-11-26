import { useState, type ReactNode } from "react";
import { StyleSheet, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  rushPipelineAccess,
  useGeofences,
  useMyPermissions,
} from "@repo/hooks";
import {
  goalMetricOfPage,
  goalPageId,
  modulePermissions,
  moduleSettingsFor,
  permissionOfWhoCanPage,
  whoCanPageId,
  type ModuleSettings,
} from "@repo/hooks/module-settings";
import { RUSH_READ_NOTES } from "@repo/hooks/rush-notes-access";
import { errorCopy } from "@repo/hooks/error-copy";
import {
  GOAL_METRIC_COPY,
  INTEREST_FORM_SETTINGS_COPY,
  MEETING_SECTIONS_COPY,
  MODULE_ALWAYS_ON,
  MODULE_TOOLS_ON_WEB,
  RUSH_SETTINGS_COPY,
  can,
  isBetaOffModule,
  isModuleEnabled,
  moduleSwitchLine,
  moduleTierLabel,
  type GoalMetric,
  type PatchChapterConfig,
} from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import {
  BACK_TO_CHAPTER_SETTINGS,
  type BackTarget,
} from "@/components/back-row";
import { InlineNote } from "@/components/inline-note";
import { ListRow, ListSection } from "@/components/list-section";
import { ScreenShell } from "@/components/screen-shell";
import { ChapterPageState } from "@/components/settings/chapter-page-state";
import { AnnouncementsChannelSection } from "@/components/settings/modules/announcements-channel";
import { InterestFormPage } from "@/components/settings/modules/interest-form-page";
import { InterestQuestionPage } from "@/components/settings/modules/interest-question-page";
import {
  MeetingSectionsPage,
  MeetingSectionsRow,
} from "@/components/settings/modules/meeting-sections";
import {
  GoalPage,
  ModuleGoalsSection,
} from "@/components/settings/modules/module-goals";
import {
  PointsRules,
  ServiceHoursRules,
} from "@/components/settings/modules/module-rules";
import {
  ModuleWhoCanSection,
  WhoCanPermissionPage,
} from "@/components/settings/modules/module-who-can";
import {
  RushModuleSettings,
  RushNotesAccess,
} from "@/components/settings/modules/rush-module-settings";
import { RushStagesPage } from "@/components/settings/modules/rush-stages-page";
import { RushTagsPage } from "@/components/settings/modules/rush-tags-page";
import { ErrorState } from "@/components/state-block";
import { Toggle } from "@/components/toggle";
import { firstParam } from "@/lib/route-params";
import { useChapterTab } from "@/lib/settings/chapter-tab";
import { typeRole, useFrappTheme } from "@/lib/theme";

/** The measures each module's Goals group holds. */
const GOAL_METRICS: Readonly<Record<string, readonly GoalMetric[]>> = {
  points: ["points"],
  hours: ["service", "study"],
};

/** A question's own screen under the Interest form: `question-<id>`. */
const QUESTION_PAGE = "question-";

/**
 * One module's screen in the phone's Chapter settings (#6030), web's module
 * page (`module-settings-page.tsx` and `settings-page.tsx`'s builder) in the
 * phone's grouped rows, with the same rows, order and words: the module's
 * switch as the first row, its Rules typed or switched in place, its Goals,
 * then Who can, each row showing its value and pushing a screen of its own.
 * Reached from Chapter settings' Modules group, as iOS Settings and Discord
 * mobile's channel settings push a page per item.
 *
 * One route for the module and its screens: `/module-settings?module=points`
 * is the module, and `&page=` one of its screens, as web's `?page=` is: a
 * permission's (`can-<permission>`), a goal's (`goal-<metric>`), Meetings'
 * sections, Recruitment's interest form, a question of it, stages and tags.
 * An unknown or refused `page` shows the module itself.
 *
 * The officer tools (Chat admin, Discord import, the points ledger, service
 * history, drawing zones, exporting a report) stay on the web dashboard
 * (Paul's pick); a viewer who holds one reads that once, in the screen's last
 * line. The switch and the Rules need `chapter-config:view`, as Chapter
 * settings does; the switch and Rules write with `chapter-config:manage`.
 */
export function ModuleSettingsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    module?: string | string[];
    page?: string | string[];
  }>();
  const key = firstParam(params.module) ?? "";
  const page = firstParam(params.page);
  const module = isBetaOffModule(key) ? undefined : moduleSettingsFor(key);
  const permissionsQuery = useMyPermissions();
  const tab = useChapterTab();
  // The stages screen holds the scroll while a stage is dragged.
  const [dragging, setDragging] = useState(false);

  if (!module) {
    return (
      <ScreenShell back={BACK_TO_CHAPTER_SETTINGS} title="Chapter settings">
        <ErrorState
          title="This page is gone"
          body="Go back to Chapter settings to see the modules as they are now."
        />
      </ScreenShell>
    );
  }
  if (permissionsQuery.data && !tab.access.chapter) {
    return (
      <ScreenShell back={BACK_TO_CHAPTER_SETTINGS} title={module.label}>
        <InlineNote>Your role can&apos;t open this page.</InlineNote>
      </ScreenShell>
    );
  }

  const permissions = tab.permissions;
  const config = tab.orgConfig.data;
  const on = config?.enabled_modules
    ? isModuleEnabled(config.enabled_modules, key)
    : isModuleEnabled(tab.chapterQuery.data?.enabled_modules, key);
  const canSeeWhoCan = can("members:view", permissions);
  const rushReads = on && rushPipelineAccess(permissions).view;
  const open = (next: string) =>
    router.push({
      pathname: "/module-settings",
      params: { module: key, page: next },
    });
  const back: BackTarget = {
    label: module.label,
    href: { pathname: "/module-settings", params: { module: key } },
  };
  const patch = (diff: PatchChapterConfig) => tab.patchConfig.mutateAsync(diff);

  // A screen of the module's, where this viewer may open it.
  const subpage = ((): { title: string; body: ReactNode } | null => {
    if (!page) return null;
    const permission = permissionOfWhoCanPage(page);
    if (permission) {
      const entry = canSeeWhoCan
        ? modulePermissions(key).find((each) => each.permission === permission)
        : undefined;
      if (!entry) return null;
      return {
        title: entry.label,
        body: (
          <WhoCanPermissionPage
            permission={entry.permission}
            canEdit={can("roles:manage", permissions)}
            note={
              entry.permission === RUSH_READ_NOTES ? (
                <RushNotesAccess
                  canEditRoles={can("roles:manage", permissions)}
                />
              ) : undefined
            }
          />
        ),
      };
    }
    const metric = goalMetricOfPage(page);
    if (metric) {
      if (!GOAL_METRICS[key]?.includes(metric)) return null;
      return {
        title: GOAL_METRIC_COPY[metric].label,
        body: <GoalPage metric={metric} canManage={tab.canManage} />,
      };
    }
    if (key === "meetings" && page === "sections") {
      return {
        title: MEETING_SECTIONS_COPY.title,
        body: <MeetingSectionsPage canManage={tab.canManage} />,
      };
    }
    // Recruitment's reads are refused with the module off or without
    // `rush:view`, so its screens exist only where their rows do.
    if (key !== "rush" || !rushReads) return null;
    if (page === "interest-form") {
      return {
        title: INTEREST_FORM_SETTINGS_COPY.title,
        body: (
          <InterestFormPage
            onOpenQuestion={(id) => open(`${QUESTION_PAGE}${id}`)}
          />
        ),
      };
    }
    if (page.startsWith(QUESTION_PAGE)) {
      return {
        title: "Question",
        body: (
          <InterestQuestionPage
            questionId={page.slice(QUESTION_PAGE.length)}
            onGone={() => router.back()}
          />
        ),
      };
    }
    if (page === "stages") {
      return {
        title: RUSH_SETTINGS_COPY.stages.title,
        body: <RushStagesPage onDragging={setDragging} />,
      };
    }
    if (page === "tags") {
      return { title: RUSH_SETTINGS_COPY.tags.title, body: <RushTagsPage /> };
    }
    return null;
  })();

  if (subpage) {
    // A question's screen goes back to the Interest form under it.
    const under: BackTarget = page?.startsWith(QUESTION_PAGE)
      ? {
          label: INTEREST_FORM_SETTINGS_COPY.title,
          href: {
            pathname: "/module-settings",
            params: { module: key, page: "interest-form" },
          },
        }
      : back;
    return (
      <ScreenShell
        back={under}
        title={subpage.title}
        scrollEnabled={!dragging}
        keyboardShouldPersistTaps="handled"
        avoidKeyboard
      >
        {subpage.body}
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      back={BACK_TO_CHAPTER_SETTINGS}
      title={module.label}
      subtitle={moduleTierLabel(module.tier)}
      keyboardShouldPersistTaps="handled"
      avoidKeyboard
    >
      <ChapterPageState query={tab.orgConfig}>
        <ModuleSwitch
          module={module}
          on={on}
          canManage={tab.canManage}
          patch={patch}
        />
        {key === "points" ? (
          <PointsRules
            config={config}
            canManage={tab.canManage}
            patch={patch}
          />
        ) : null}
        {key === "hours" ? (
          <ServiceHoursRules
            config={config}
            canManage={tab.canManage}
            patch={patch}
          />
        ) : null}
        {key === "meetings" ? (
          <MeetingSectionsRow onOpen={() => open("sections")} />
        ) : null}
        {key === "rush" ? (
          <RushModuleSettings
            permissions={permissions}
            moduleOn={on}
            canSeeRoles={canSeeWhoCan}
            onOpen={open}
          />
        ) : null}
        {key === "announcements" ? (
          <AnnouncementsChannelSection
            canOpen={can("channels:manage", permissions)}
          />
        ) : null}
        {key === "geofences" ? (
          <StudyZonesRow show={on && canSeeWhoCan} />
        ) : null}
        {GOAL_METRICS[key] ? (
          <ModuleGoalsSection
            metrics={GOAL_METRICS[key]!}
            onOpen={(metric) => open(goalPageId(metric))}
          />
        ) : null}
        {canSeeWhoCan ? (
          <ModuleWhoCanSection
            moduleKey={key}
            onOpen={(permission) => open(whoCanPageId(permission))}
          />
        ) : null}
        <ToolsOnWeb moduleKey={key} on={on} permissions={permissions} />
      </ChapterPageState>
    </ScreenShell>
  );
}

/** The module's switch, its first row; an always-on module says so instead. */
function ModuleSwitch({
  module,
  on,
  canManage,
  patch,
}: {
  module: ModuleSettings;
  on: boolean;
  canManage: boolean;
  patch: (diff: PatchChapterConfig) => Promise<unknown>;
}) {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  if (module.alwaysOn) {
    return (
      <ListSection>
        <ListRow label={module.label} value={MODULE_ALWAYS_ON} />
      </ListSection>
    );
  }
  return (
    <ListSection>
      <ListRow
        label={module.label}
        description={
          failed ??
          moduleSwitchLine({
            on,
            alwaysOn: module.alwaysOn,
            offNote: module.offNote,
            canManage,
          })
        }
        descriptionTone={failed ? "destructive" : "default"}
        trailing={
          <Toggle
            value={on}
            disabled={!canManage || saving}
            accessibilityLabel={module.label}
            onValueChange={(next) => {
              setFailed(null);
              setSaving(true);
              patch({ enabled_modules: { [module.key]: next } })
                .catch((error: unknown) =>
                  setFailed(
                    errorCopy(
                      error,
                      `${module.label} wasn't turned ${next ? "on" : "off"}. Try again.`,
                    ),
                  ),
                )
                .finally(() => setSaving(false));
            }}
          />
        }
      />
    </ListSection>
  );
}

/**
 * Study zones: how many zones the chapter has, read-only, since zones are
 * drawn on the web dashboard. The route needs `members:view` and the module
 * on, so it isn't asked otherwise. Moved here from Chapter settings' Chapter
 * group, where it sat before the phone had module screens.
 */
function StudyZonesRow({ show }: { show: boolean }) {
  const zonesQuery = useGeofences({ enabled: show });
  if (!show) return null;
  const zones = zonesQuery.data as unknown;
  const count = Array.isArray(zones) ? zones.length : null;
  return (
    <ListSection footnote={MODULE_TOOLS_ON_WEB.geofences!.line}>
      <ListRow
        label="Zones"
        variant="detail"
        value={
          count === null ? "—" : `${count} ${count === 1 ? "zone" : "zones"}`
        }
      />
    </ListSection>
  );
}

/**
 * The screen's last line, for a viewer who holds this module's officer tool
 * while it's on: that tool is on the web dashboard (Paul's pick, #6030).
 * Study zones says it under its Zones row instead.
 */
function ToolsOnWeb({
  moduleKey,
  on,
  permissions,
}: {
  moduleKey: string;
  on: boolean;
  permissions: readonly string[];
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const tool = MODULE_TOOLS_ON_WEB[moduleKey];
  if (!tool || moduleKey === "geofences") return null;
  if (!can(tool.permission, permissions)) return null;
  // A tool hides with its module off, except Chat's, which is always on.
  if (!on && moduleKey !== "chat") return null;
  return <Text style={styles.footnote}>{tool.line}</Text>;
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    footnote: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.muted,
      paddingHorizontal: tokens.spacing.xs,
    },
  });
}
