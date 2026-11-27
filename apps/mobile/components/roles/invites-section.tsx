import { useMemo, useRef, useState } from "react";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  useInvitableRoleIds,
  useMembers,
  useOrgConfig,
  usePatchOrgConfig,
  useRoles,
  useTransferPresidency,
  useViewerDisplayName,
  useViewerUserId,
  type MemberProfile,
} from "@repo/hooks";
import { errorCopy } from "@repo/hooks/error-copy";
import {
  defaultInviteRoleChoices,
  parseChapterRoles,
} from "@repo/hooks/chapter-roles";
import { memberLabel } from "@repo/hooks/display-names";
import {
  INVITES_FOOTNOTE,
  PEOPLE_SETTINGS_COPY,
  transferPresidencyConfirm,
} from "@repo/validation";
import { ListRow, ListSection, SectionHeader } from "@/components/list-section";
import { OptionSheet } from "@/components/option-sheet";
import { confirmAlert } from "@/lib/minutes/meetings-on";

/**
 * Invites and presidency on the phone (#6029), web's group of the same name
 * in its rows and words: **Default invite role**, the role an invite grants
 * when it picks none, picked from a sheet and saved on the pick (the choices
 * are web's, `defaultInviteRoleChoices`); and, for the President alone,
 * **Transfer presidency**, a searchable list of members that asks to confirm,
 * naming who gets it (`transferPresidencyConfirm`). Both write a Logs entry,
 * which the footnote says.
 *
 * The Default invite role row needs the chapter config, so it hides without
 * `chapter-config:view` or while that read is out, rather than showing "No
 * role" for a chapter that has one; the group hides when neither row shows.
 */
export function InvitesSection({
  canViewConfig,
  canManageConfig,
  isPresident,
}: {
  canViewConfig: boolean;
  canManageConfig: boolean;
  isPresident: boolean;
}) {
  const configQuery = useOrgConfig({ enabled: canViewConfig });
  const configReady = canViewConfig && configQuery.data !== undefined;
  if (!configReady && !isPresident) return null;
  return (
    <>
      <SectionHeader>{PEOPLE_SETTINGS_COPY.invitesHeading}</SectionHeader>
      <ListSection footnote={INVITES_FOOTNOTE}>
        {configReady ? (
          <DefaultInviteRoleRow
            canManage={canManageConfig}
            configuredId={configQuery.data?.default_invite_role_id ?? null}
          />
        ) : null}
        {isPresident ? <TransferPresidencyRow /> : null}
      </ListSection>
    </>
  );
}

function DefaultInviteRoleRow({
  canManage,
  configuredId,
}: {
  canManage: boolean;
  configuredId: string | null;
}) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const rolesQuery = useRoles();
  const invitableQuery = useInvitableRoleIds({ enabled: canManage });
  const patch = usePatchOrgConfig();
  const [failure, setFailure] = useState<string | null>(null);
  const roles = useMemo(
    () => parseChapterRoles(rolesQuery.data),
    [rolesQuery.data],
  );
  const { options, selectedId, dangling } = defaultInviteRoleChoices(
    roles,
    configuredId,
    invitableQuery.data,
  );
  const value =
    selectedId === null
      ? PEOPLE_SETTINGS_COPY.noDefaultInviteRole
      : (options.find((role) => role.id === selectedId)?.name ?? "");
  const canPick =
    canManage && !patch.isPending && rolesQuery.data !== undefined;
  const description =
    failure ??
    (dangling
      ? "That role is gone. Pick another."
      : rolesQuery.isError && rolesQuery.data === undefined
        ? "Roles could not load, so this can't change right now."
        : null);

  async function save(roleId: string | null) {
    if (roleId === selectedId) return;
    setFailure(null);
    try {
      await patch.mutateAsync({ default_invite_role_id: roleId });
    } catch (error) {
      setFailure(
        `Couldn't save the default invite role. ${errorCopy(error, "Try again in a moment.", { serverWritesForMembers: true })}`,
      );
    }
  }

  return (
    <>
      <ListRow
        label={PEOPLE_SETTINGS_COPY.defaultInviteRole}
        value={value}
        description={description}
        descriptionTone={failure || dangling ? "destructive" : "default"}
        busy={patch.isPending}
        onPress={canPick ? () => sheetRef.current?.present() : undefined}
        accessibilityHint="Opens the roles an invite can give."
      />
      {canManage ? (
        <OptionSheet
          ref={sheetRef}
          title={PEOPLE_SETTINGS_COPY.defaultInviteRole}
          searchPlaceholder="Find a role"
          options={[
            { value: null, label: PEOPLE_SETTINGS_COPY.noDefaultInviteRole },
            ...options.map((role) => ({ value: role.id, label: role.name })),
          ]}
          selected={selectedId}
          onSelect={(roleId) => void save(roleId)}
        />
      ) : null}
    </>
  );
}

function rowName(member: MemberProfile): string {
  return memberLabel(member.display_name, member.user_id);
}

function TransferPresidencyRow() {
  const sheetRef = useRef<BottomSheetModal>(null);
  const membersQuery = useMembers();
  const viewerUserId = useViewerUserId();
  const viewerName = useViewerDisplayName();
  const transfer = useTransferPresidency();
  const [line, setLine] = useState<{
    text: string;
    failed: boolean;
  } | null>(null);
  const others = (membersQuery.data ?? [])
    .filter((member) => member.user_id !== viewerUserId && member.id)
    .sort((a, b) => rowName(a).localeCompare(rowName(b)));

  async function handleTransfer(memberId: string) {
    const member = others.find(
      (candidate) => String(candidate.id) === memberId,
    );
    if (!member) return;
    const name = rowName(member);
    const words = transferPresidencyConfirm(name);
    const ok = await confirmAlert({
      title: words.title,
      body: words.body,
      confirmLabel: words.action,
      destructive: true,
    });
    if (!ok) return;
    setLine(null);
    try {
      await transfer.mutateAsync({ target_member_id: String(member.id) });
      setLine({ text: `${name} is now President.`, failed: false });
    } catch (error) {
      setLine({
        text: `Couldn't transfer presidency. ${errorCopy(error, "Only the current president can transfer it.", { serverWritesForMembers: true })}`,
        failed: true,
      });
    }
  }

  return (
    <>
      <ListRow
        label={PEOPLE_SETTINGS_COPY.transferPresidency}
        value={viewerName ?? "You"}
        description={
          line?.text ??
          (membersQuery.isError && membersQuery.data === undefined
            ? "Couldn't load members"
            : null)
        }
        descriptionTone={line?.failed ? "destructive" : "default"}
        busy={transfer.isPending}
        onPress={
          membersQuery.data ? () => sheetRef.current?.present() : undefined
        }
        accessibilityHint="Opens the members, to pick the new President."
      />
      <OptionSheet
        ref={sheetRef}
        title="Pick the new President"
        searchPlaceholder="Find a member"
        options={others.map((member) => ({
          value: String(member.id),
          label: rowName(member),
        }))}
        selected={null}
        onSelect={(memberId) => {
          if (memberId !== null) void handleTransfer(memberId);
        }}
      />
    </>
  );
}
