"use client";

import {
  useChannels,
  useGroups,
  useRoles,
  useRushSettings,
  useSaveRushSettings,
  type RushSettingsPatch,
} from "@repo/hooks";
import { ProfileSection } from "@/components/profile/profile-section";
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
export function namesList(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The rest of the Recruitment module page (#5973,
 * `spec/behavior/ifc-recruitment.md` § Where the chapter's settings live):
 * the role an accepted prospect joins with, and, for interest-form sign-ups,
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
  const readOnly = canEdit ? null : "Your role can't change this.";

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
      <ProfileSection id="settings-module-rush-joining" title="Joining">
        <SettingsGroup footnote="A prospect whose acceptance is confirmed is invited to join with this role.">
          <SettingsRow
            label="New member role"
            description={
              noRole ? (
                <span className="text-warning">
                  Your New members tier has no role. Pick one.
                </span>
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
                <SelectTrigger className={TRIGGER} aria-label="New member role">
                  <SelectValue
                    placeholder={
                      rolesQuery.isError ? "Couldn't load roles" : "Pick a role"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {defaultRole ? (
                    <SelectItem value={NONE}>
                      {`${defaultRole.name} (default)`}
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
      </ProfileSection>

      <ProfileSection id="settings-module-rush-sign-ups" title="Sign-ups">
        <SettingsGroup footnote="Used once your interest form is open. The card shows a name and stage, never contact details.">
          <SettingsRow
            label="Recruitment contacts"
            description={
              skipped.length > 0 ? (
                <span className="text-warning">
                  {`${namesList(skipped)} can't open recruitment, so ${
                    skipped.length === 1 ? "isn't" : "aren't"
                  } told.`}
                </span>
              ) : (
                (readOnly ??
                "Told about each sign-up, with recruitment's managers")
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
                  aria-label="Recruitment contacts"
                >
                  <SelectValue placeholder="Pick a Group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No Group</SelectItem>
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
            label="Card channel"
            description={
              readOnly ?? "Only a channel everyone in it can open recruitment"
            }
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
                <SelectTrigger className={TRIGGER} aria-label="Card channel">
                  <SelectValue placeholder="Pick a channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No card</SelectItem>
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
      </ProfileSection>
    </>
  );
}
