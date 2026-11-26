"use client";

import {
  useChannels,
  useGroups,
  useRoles,
  useRushSettings,
  useSaveRushSettings,
  type RushSettingsPatch,
} from "@repo/hooks";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastFailure } from "@/lib/failure-toast";
import { asArray } from "@/lib/utils";
import { RushDaysRow } from "./rush-stale-days";
import {
  RUSH_BID_EXPIRY_DAYS_MAX,
  RUSH_BID_EXPIRY_DAYS_MIN,
  RUSH_SETTINGS_COPY,
  joinNames,
  rushContactsSkippedLine,
} from "@repo/validation";

const COPY = RUSH_SETTINGS_COPY;

/** The menu value for "no pick": the default role, no Group, no card. */
const NONE = "__none";

type RoleOption = { id: string; name: string; permissions: string[] };

type ChannelOption = {
  id: string;
  name: string;
  type?: string;
  archived_at?: string | null;
};

const TRIGGER = "w-56 max-w-[50vw]";

/** "Ana", "Ana and Ben", "Ana, Ben and Cal". */
export const namesList = joinNames;

/**
 * The rest of the Recruitment module page (#5973,
 * `spec/behavior/ifc-recruitment.md` § Where the chapter's settings live):
 * how long a bid stays open (Winston, 2026-11-24: a chapter setting until
 * councils land), the role an accepted prospect joins with, and, for
 * interest-form sign-ups,
 * the recruitment contacts Group and the channel their card goes to. Each is a
 * settings row whose value opens its menu and saves on pick (rulebook § 9);
 * a holder of `rush:manage` changes them, everyone else reads them.
 *
 * The new-member role defaults to the first role in the New members tier
 * (#4068 decision 10), not the chapter's default invite role, which in some
 * chapters is a full member's. With no such role the row asks for a pick.
 */
export function RushRecruitmentPicks({
  canEdit,
  canSeeRoles,
}: {
  canEdit: boolean;
  /** `members:view`, which reading the roles and Groups needs. */
  canSeeRoles: boolean;
}) {
  const settingsQuery = useRushSettings();
  const rolesQuery = useRoles({ enabled: canSeeRoles });
  const groupsQuery = useGroups({ enabled: canSeeRoles });
  const channelsQuery = useChannels();
  const save = useSaveRushSettings();
  const settings = settingsQuery.data;
  if (!settings) return null;

  const locked = !canEdit || save.isPending;
  const readOnly = canEdit ? null : COPY.roleCantChange;

  const roles = asArray<RoleOption>(rolesQuery.data).filter(
    (role) => !role.permissions.includes("*"),
  );
  const defaultRole =
    roles.find((role) => role.id === settings.default_new_member_role_id) ??
    null;
  const picked = settings.new_member_role_id;
  const roleValue =
    picked === null
      ? defaultRole
        ? NONE
        : ""
      : roles.some((role) => role.id === picked)
        ? picked
        : "";
  const noRole = picked === null && !defaultRole && rolesQuery.isSuccess;

  const groups = groupsQuery.data ?? [];
  const groupKnown =
    settings.contacts_group_id === null ||
    groups.some((group) => group.id === settings.contacts_group_id);
  const skipped = settings.contacts_group_skipped.map((m) => m.display_name);

  const channels = asArray<ChannelOption>(channelsQuery.data).filter(
    (channel) =>
      !channel.archived_at &&
      channel.type !== "DM" &&
      channel.type !== "GROUP_DM",
  );
  const channelKnown =
    settings.card_channel_id === null ||
    channels.some((channel) => channel.id === settings.card_channel_id);

  function pick(patch: RushSettingsPatch, what: string) {
    save.mutate(patch, {
      onError: (error) =>
        toastFailure({
          title: `Couldn't change ${what}`,
          error,
          fallback: "Retry in a moment.",
        }),
    });
  }

  return (
    <>
      <SettingsGroup
        heading={COPY.joining.heading}
        footnote={COPY.joining.footnote}
      >
        <SettingsRow
          label={COPY.joining.label}
          description={
            noRole ? (
              <span className="text-warning">{COPY.joining.noRole}</span>
            ) : (
              (readOnly ?? undefined)
            )
          }
          control={
            <Select
              value={roleValue}
              disabled={locked || !rolesQuery.isSuccess}
              onValueChange={(next) =>
                pick(
                  { new_member_role_id: next === NONE ? null : next },
                  "the new member role",
                )
              }
            >
              <SelectTrigger
                className={TRIGGER}
                aria-label={COPY.joining.label}
              >
                <SelectValue
                  placeholder={
                    rolesQuery.isError
                      ? COPY.joining.rolesFailed
                      : COPY.joining.pick
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {defaultRole ? (
                  <SelectItem value={NONE}>
                    {`${defaultRole.name}${COPY.joining.defaultSuffix}`}
                  </SelectItem>
                ) : null}
                {roles
                  .filter((role) => role.id !== defaultRole?.id)
                  .map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          }
        />
      </SettingsGroup>

      <SettingsGroup
        heading={COPY.signUps.heading}
        footnote={COPY.signUps.footnote}
      >
        <SettingsRow
          label={COPY.signUps.contacts}
          description={
            skipped.length > 0 ? (
              <span className="text-warning">
                {rushContactsSkippedLine(skipped)}
              </span>
            ) : (
              (readOnly ?? COPY.signUps.contactsHint)
            )
          }
          control={
            <Select
              value={groupKnown ? (settings.contacts_group_id ?? NONE) : ""}
              disabled={locked || !groupsQuery.isSuccess}
              onValueChange={(next) =>
                pick(
                  { contacts_group_id: next === NONE ? null : next },
                  "the recruitment contacts",
                )
              }
            >
              <SelectTrigger
                className={TRIGGER}
                aria-label={COPY.signUps.contacts}
              >
                <SelectValue placeholder={COPY.signUps.pickGroup} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{COPY.signUps.noGroup}</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        <SettingsRow
          label={COPY.signUps.card}
          description={readOnly ?? COPY.signUps.cardHint}
          control={
            <Select
              value={channelKnown ? (settings.card_channel_id ?? NONE) : ""}
              disabled={locked || !channelsQuery.isSuccess}
              onValueChange={(next) =>
                pick(
                  { card_channel_id: next === NONE ? null : next },
                  "the card channel",
                )
              }
            >
              <SelectTrigger className={TRIGGER} aria-label={COPY.signUps.card}>
                <SelectValue placeholder={COPY.signUps.pickChannel} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{COPY.signUps.noCard}</SelectItem>
                {channels.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    {`#${channel.name}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </SettingsGroup>
    </>
  );
}

/**
 * Recruitment → Rules' bid row (Winston, 2026-11-24): how many days a bid
 * stays open unless the prospect answers first. A chapter setting until
 * councils land; `rush:manage` changes it.
 */
export function RushBidExpiryRow({ canEdit }: { canEdit: boolean }) {
  const settingsQuery = useRushSettings();
  const save = useSaveRushSettings();
  const settings = settingsQuery.data;
  if (!settings) return null;
  if (!canEdit) {
    return (
      <SettingsRow
        label={COPY.bidDays.readOnly(settings.bid_expiry_days)}
        description={COPY.roleCantChange}
        control={null}
      />
    );
  }
  return (
    <RushDaysRow
      days={settings.bid_expiry_days}
      min={RUSH_BID_EXPIRY_DAYS_MIN}
      max={RUSH_BID_EXPIRY_DAYS_MAX}
      label={COPY.bidDays.label}
      description={COPY.bidDays.hint}
      ariaLabel="Days a bid stays open before it expires"
      failTitle={COPY.bidDays.failed}
      onSave={(days, done) => save.mutate({ bid_expiry_days: days }, done)}
    />
  );
}
