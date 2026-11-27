import { useRef, useState } from "react";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  rushPipelineAccess,
  useChannels,
  useGroups,
  useInterestFormSettings,
  useRoles,
  useRushPipeline,
  useRushSettings,
  useSaveRushSettings,
  useUpdateRoleTier,
  type RushSettingsPatch,
} from "@repo/hooks";
import { usePermissionOverlay } from "@repo/hooks/permission-overlay";
import {
  RUSH_READ_NOTES,
  rushNotesAccess,
} from "@repo/hooks/rush-notes-access";
import { errorCopy } from "@repo/hooks/error-copy";
import { countSummary } from "@repo/hooks/module-settings";
import {
  INTEREST_FORM_SETTINGS_COPY,
  RUSH_BID_EXPIRY_DAYS_MAX,
  RUSH_BID_EXPIRY_DAYS_MIN,
  RUSH_SETTINGS_COPY as COPY,
  RUSH_STALE_DAYS_MAX,
  RUSH_STALE_DAYS_MIN,
  rushContactsSkippedLine,
} from "@repo/validation";
import { InlineNote } from "@/components/inline-note";
import { ListRow, ListSection, SectionHeader } from "@/components/list-section";
import { OptionSheet, type SheetOption } from "@/components/option-sheet";
import { NumberRow } from "@/components/settings/modules/number-row";
import {
  ClipboardListGlyph,
  ColumnsGlyph,
  TagGlyph,
} from "@/components/settings-glyphs";
import { describeError } from "@/lib/roles/save-error";
import { useRolesData } from "@/lib/roles/use-roles-data";
import { useFrappTheme } from "@/lib/theme";

/**
 * Recruitment's module screen on the phone (#5924, #6030), web's
 * `RushModuleSettings` in the phone's rows, in its order and words: the
 * Interest form as a row saying whether it's open, a Rules group with the
 * follow-up and bid days typed in place and a row each for the Stages and
 * Tags, which push their editors, then who an accepted prospect joins as and
 * who hears about sign-ups.
 *
 * Every read here (the pipeline, the settings, the interest form) is refused
 * by the API with Recruitment off or without `rush:view`, so none is sent
 * then, and none of these rows draw; `rush:manage` edits them.
 */
export function RushModuleSettings({
  permissions,
  moduleOn,
  canSeeRoles,
  onOpen,
}: {
  permissions: readonly string[];
  moduleOn: boolean;
  /** `members:view`, which reading the roles and Groups needs. */
  canSeeRoles: boolean;
  /** Pushes one of the page's own screens. */
  onOpen: (page: "interest-form" | "stages" | "tags") => void;
}) {
  const { tokens } = useFrappTheme();
  const glyph = tokens.color.text.mutedForeground;
  const access = rushPipelineAccess(permissions);
  const reads = moduleOn && access.view;
  const pipeline = useRushPipeline({ enabled: reads });
  const settings = useRushSettings({ enabled: reads });
  const form = useInterestFormSettings({ enabled: reads });
  const save = useSaveRushSettings();
  if (!reads) return null;

  const formValue = form.isPending
    ? "Loading"
    : form.isError
      ? "Couldn't load"
      : !form.data.offered || !form.data.form
        ? "Not offered"
        : form.data.form.is_open
          ? "Open"
          : INTEREST_FORM_SETTINGS_COPY.closed;

  const saveDays = (patch: RushSettingsPatch) => save.mutateAsync(patch);

  return (
    <>
      <ListSection>
        <ListRow
          leading={<ClipboardListGlyph color={glyph} />}
          label={INTEREST_FORM_SETTINGS_COPY.title}
          value={formValue}
          accessibilityHint="Opens the interest form's settings."
          onPress={() => onOpen("interest-form")}
        />
      </ListSection>

      {pipeline.data ? (
        <>
          <SectionHeader>Rules</SectionHeader>
          <ListSection>
            {access.manage ? (
              <NumberRow
                label={COPY.staleDays.label}
                hint={COPY.staleDays.hint}
                suffix={COPY.daysSuffix}
                value={pipeline.data.stale_days}
                min={RUSH_STALE_DAYS_MIN}
                max={RUSH_STALE_DAYS_MAX}
                outOfRange={COPY.daysRange(
                  RUSH_STALE_DAYS_MIN,
                  RUSH_STALE_DAYS_MAX,
                )}
                editable
                onSave={(days) =>
                  saveDays({ stale_days: days ?? pipeline.data.stale_days })
                }
              />
            ) : (
              <ListRow
                label={COPY.staleDays.readOnly(pipeline.data.stale_days)}
                description={COPY.roleCantChange}
              />
            )}
            {settings.data ? (
              access.manage ? (
                <NumberRow
                  label={COPY.bidDays.label}
                  hint={COPY.bidDays.hint}
                  suffix={COPY.daysSuffix}
                  value={settings.data.bid_expiry_days}
                  min={RUSH_BID_EXPIRY_DAYS_MIN}
                  max={RUSH_BID_EXPIRY_DAYS_MAX}
                  outOfRange={COPY.daysRange(
                    RUSH_BID_EXPIRY_DAYS_MIN,
                    RUSH_BID_EXPIRY_DAYS_MAX,
                  )}
                  editable
                  onSave={(days) =>
                    saveDays({
                      bid_expiry_days: days ?? settings.data.bid_expiry_days,
                    })
                  }
                />
              ) : (
                <ListRow
                  label={COPY.bidDays.readOnly(settings.data.bid_expiry_days)}
                  description={COPY.roleCantChange}
                />
              )
            ) : null}
            <ListRow
              leading={<ColumnsGlyph color={glyph} />}
              label={COPY.stages.title}
              value={countSummary(
                pipeline.data.stages.filter((stage) => !stage.hidden).length,
                "stage",
                "stages",
              )}
              accessibilityHint="Opens the recruitment stages."
              onPress={() => onOpen("stages")}
            />
            <ListRow
              leading={<TagGlyph color={glyph} />}
              label={COPY.tags.title}
              value={countSummary(pipeline.data.tags.length, "tag", "tags")}
              accessibilityHint="Opens the recruitment tags."
              onPress={() => onOpen("tags")}
            />
          </ListSection>
        </>
      ) : pipeline.isError ? (
        <InlineNote tone="warning">{COPY.stagesAndTagsFailed}</InlineNote>
      ) : null}

      {settings.data ? (
        <RushRecruitmentPicks
          settings={settings.data}
          canEdit={access.manage}
          canSeeRoles={canSeeRoles}
        />
      ) : null}
    </>
  );
}

type Settings = NonNullable<ReturnType<typeof useRushSettings>["data"]>;
type RoleRow = { id: string; name: string; permissions: string[] };
type ChannelRow = {
  id: string;
  name: string;
  type?: string;
  archived_at?: string | null;
};
type Pick = "role" | "contacts" | "card";

/** The "no pick" value: the default role, no Group, no card. */
const NONE = "__none";

/**
 * Joining and Sign-ups (#5973), web's `RushRecruitmentPicks`: each a row whose
 * value opens its pick, saved on the pick (rulebook § 9). The new member role
 * defaults to the first role in the New members tier; with no such role the
 * row asks for one.
 */
function RushRecruitmentPicks({
  settings,
  canEdit,
  canSeeRoles,
}: {
  settings: Settings;
  canEdit: boolean;
  canSeeRoles: boolean;
}) {
  const rolesQuery = useRoles({ enabled: canSeeRoles });
  const groupsQuery = useGroups({ enabled: canSeeRoles });
  const channelsQuery = useChannels();
  const save = useSaveRushSettings();
  const roleSheet = useRef<BottomSheetModal>(null);
  const contactsSheet = useRef<BottomSheetModal>(null);
  const cardSheet = useRef<BottomSheetModal>(null);
  const [failed, setFailed] = useState<{ pick: Pick; message: string } | null>(
    null,
  );
  const readOnly = canEdit ? null : COPY.roleCantChange;

  const roles = (
    Array.isArray(rolesQuery.data) ? (rolesQuery.data as RoleRow[]) : []
  ).filter((role) => !role.permissions.includes("*"));
  const defaultRole =
    roles.find((role) => role.id === settings.default_new_member_role_id) ??
    null;
  const picked = settings.new_member_role_id;
  const pickedRole = roles.find((role) => role.id === picked) ?? null;
  const noRole = picked === null && !defaultRole && rolesQuery.isSuccess;
  const roleValue = pickedRole
    ? pickedRole.name
    : picked === null && defaultRole
      ? `${defaultRole.name}${COPY.joining.defaultSuffix}`
      : rolesQuery.isError
        ? COPY.joining.rolesFailed
        : COPY.joining.pick;

  const groups = groupsQuery.data ?? [];
  const group = groups.find((each) => each.id === settings.contacts_group_id);
  const skipped = settings.contacts_group_skipped.map((m) => m.display_name);

  const channels = (
    Array.isArray(channelsQuery.data)
      ? (channelsQuery.data as ChannelRow[])
      : []
  ).filter(
    (channel) =>
      !channel.archived_at &&
      channel.type !== "DM" &&
      channel.type !== "GROUP_DM",
  );
  const card = channels.find((each) => each.id === settings.card_channel_id);

  function pick(which: Pick, patch: RushSettingsPatch, what: string) {
    setFailed(null);
    save.mutate(patch, {
      onError: (error) =>
        setFailed({
          pick: which,
          message: `Couldn't change ${what}. ${errorCopy(error, "Retry in a moment.")}`,
        }),
    });
  }
  const line = (which: Pick, otherwise: string | null) =>
    failed?.pick === which ? failed.message : otherwise;
  const tone = (which: Pick) =>
    failed?.pick === which ? ("destructive" as const) : ("default" as const);
  const opens = (ready: boolean) => canEdit && ready && !save.isPending;

  const roleOptions: SheetOption[] = [
    ...(defaultRole
      ? [
          {
            value: NONE,
            label: `${defaultRole.name}${COPY.joining.defaultSuffix}`,
          },
        ]
      : []),
    ...roles
      .filter((role) => role.id !== defaultRole?.id)
      .map((role) => ({ value: role.id, label: role.name })),
  ];

  return (
    <>
      <SectionHeader>{COPY.joining.heading}</SectionHeader>
      <ListSection footnote={COPY.joining.footnote}>
        <ListRow
          label={COPY.joining.label}
          value={roleValue}
          description={line("role", noRole ? COPY.joining.noRole : readOnly)}
          descriptionTone={tone("role")}
          onPress={
            opens(rolesQuery.isSuccess)
              ? () => roleSheet.current?.present()
              : undefined
          }
        />
      </ListSection>

      <SectionHeader>{COPY.signUps.heading}</SectionHeader>
      <ListSection footnote={COPY.signUps.footnote}>
        <ListRow
          label={COPY.signUps.contacts}
          value={group?.name ?? COPY.signUps.noGroup}
          description={line(
            "contacts",
            skipped.length > 0
              ? rushContactsSkippedLine(skipped)
              : (readOnly ?? COPY.signUps.contactsHint),
          )}
          descriptionTone={tone("contacts")}
          onPress={
            opens(groupsQuery.isSuccess)
              ? () => contactsSheet.current?.present()
              : undefined
          }
        />
        <ListRow
          label={COPY.signUps.card}
          value={card ? `#${card.name}` : COPY.signUps.noCard}
          description={line("card", readOnly ?? COPY.signUps.cardHint)}
          descriptionTone={tone("card")}
          onPress={
            opens(channelsQuery.isSuccess)
              ? () => cardSheet.current?.present()
              : undefined
          }
        />
      </ListSection>

      {canEdit ? (
        <>
          <OptionSheet
            ref={roleSheet}
            title={COPY.joining.label}
            options={roleOptions}
            selected={picked ?? (defaultRole ? NONE : null)}
            searchPlaceholder="Find a role"
            onSelect={(value) =>
              pick(
                "role",
                { new_member_role_id: value === NONE ? null : value },
                "the new member role",
              )
            }
          />
          <OptionSheet
            ref={contactsSheet}
            title={COPY.signUps.contacts}
            options={[
              { value: NONE, label: COPY.signUps.noGroup },
              ...groups.map((each) => ({ value: each.id, label: each.name })),
            ]}
            selected={settings.contacts_group_id ?? NONE}
            searchPlaceholder="Find a Group"
            onSelect={(value) =>
              pick(
                "contacts",
                { contacts_group_id: value === NONE ? null : value },
                "the recruitment contacts",
              )
            }
          />
          <OptionSheet
            ref={cardSheet}
            title={COPY.signUps.card}
            options={[
              { value: NONE, label: COPY.signUps.noCard },
              ...channels.map((each) => ({
                value: each.id,
                label: `#${each.name}`,
              })),
            ]}
            selected={settings.card_channel_id ?? NONE}
            searchPlaceholder="Find a channel"
            onSelect={(value) =>
              pick(
                "card",
                { card_channel_id: value === NONE ? null : value },
                "the card channel",
              )
            }
          />
        </>
      ) : null}
    </>
  );
}

/**
 * "Nobody can read recruitment notes yet" on the Read recruitment notes
 * screen (#6030), web's `RushNotesAccess`, by the same rule
 * (`@repo/hooks/rush-notes-access`): the line, then the one-press grant to
 * the top two tiers as an action row, dimmed with its reason when the officer
 * can't make it. The write is each tier's permission list, so it needs
 * `roles:manage` and the rank rules.
 */
export function RushNotesAccess({ canEditRoles }: { canEditRoles: boolean }) {
  const { rolesQuery, tiersQuery, roles, tiers, reach, words } = useRolesData();
  const updateTier = useUpdateRoleTier();
  const [failure, setFailure] = useState<string | null>(null);
  const toggle = usePermissionOverlay(
    tiers,
    (tier, next) =>
      updateTier.mutateAsync({ id: tier.id, body: { permissions: next } }),
    (tier, error) => setFailure(describeError(tier.name, error)),
  );
  const [granting, setGranting] = useState(false);
  if (!rolesQuery.data || !tiersQuery.data) return null;
  const access = rushNotesAccess({
    tiers,
    roles,
    tierHolds: (tier) => toggle.permissionsOf(tier).includes(RUSH_READ_NOTES),
    reach,
    canEditRoles,
    tierPlural: words.plural,
  });
  if (!access) return null;

  async function grant(missing: NonNullable<typeof access>["missing"]) {
    setFailure(null);
    setGranting(true);
    try {
      // The overlay reports a failed write and doesn't throw; a tier it
      // failed on stays missing, so the row stays to retry.
      for (const tier of missing) {
        await toggle.toggle(tier, RUSH_READ_NOTES, false);
      }
    } finally {
      setGranting(false);
    }
  }

  return (
    <>
      <SectionHeader>Notes</SectionHeader>
      <ListSection footnote={failure}>
        <ListRow label={access.line} variant="detail" />
        <ListRow
          label={access.action}
          description={access.why}
          action
          disabled={access.why !== null}
          busy={granting}
          onPress={() => void grant(access.missing)}
        />
      </ListSection>
    </>
  );
}
