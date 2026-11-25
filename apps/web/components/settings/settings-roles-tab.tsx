"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, UserPlus } from "lucide-react";
import { defaultInviteRoleChoices } from "@repo/hooks/chapter-roles";
import { parseChapterRoles } from "@repo/hooks/chapter-roles";
import { matchesWordStarts, normalizeWords } from "@repo/hooks/fuzzy-match";
import {
  useGroups,
  useInvitableRoleIds,
  useMyPermissions,
  useRoles,
} from "@repo/hooks";
import {
  can,
  canAny,
  groupDisplayName,
  INVITES_FOOTNOTE,
  PEOPLE_SETTINGS_COPY,
} from "@repo/validation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";
import {
  PresidencyClaimBanner,
  TransferPresidencyRow,
} from "@/components/roles/presidency";
import { RolesOverview } from "@/components/roles/roles-overview";
import { TierPermissionsPage } from "@/components/roles/tier-permissions-page";
import { RolePage } from "@/components/roles/role-page";
import {
  AutomaticGroupsPage,
  GroupPage,
  GroupsGroup,
} from "@/components/roles/groups-section";
import { useRolesData } from "@/components/roles/use-roles-data";

type Props = {
  /** Whether the caller holds `chapter-config:manage`. */
  canManage: boolean;
  /** Persisted `chapters.default_invite_role_id` (#422); null = no default set. */
  defaultInviteRoleId: string | null;
  /** Persist the default invite role through the config PATCH mutation. */
  onSaveDefaultInviteRole: (roleId: string | null) => Promise<void> | void;
  /** Whether a config PATCH is in flight. */
  isSavingConfig?: boolean;
  /**
   * The chapter-config read failed or was refused. The roles pages do not
   * need it, so only the default-invite-role row hides.
   */
  configUnavailable?: boolean;
};

const BASE = "/settings?tab=roles";
const AUTOMATIC = "automatic";

/**
 * Chapter settings → Roles and groups (#3990; groups joined it 2026-11-19;
 * in the settings shape since #6029, Paul's Discord channel-settings ruling).
 *
 * One page, as Paul ruled: a group per tier (its Permissions row, its roles,
 * Add role), Add tier, the roles outside the tiers, Non-chapter business,
 * Groups, then Invites and presidency. Every form of its own opens as a page
 * addressed by the URL, so Back and a shared link work, with the
 * `SettingsSubpage` back line to this page:
 *
 * | URL | Page |
 * | --- | ---- |
 * | `?tab=roles` | This page |
 * | `?tab=roles&tier=<id>` | A tier: its name, @mention switch, roles and switches (`TierPermissionsPage`) |
 * | `?tab=roles&role=<id>` | A role: name, the Role group, its permissions (`RolePage`) |
 * | `?tab=roles&group=<id>` | A group: name, color, @mention switch, members (`GroupPage`) |
 * | `?tab=roles&groups=automatic` | The groups Frapp keeps from member details (`AutomaticGroupsPage`) |
 *
 * The phone draws the same page (`apps/mobile/app/(app)/chapter-roles.tsx`)
 * with the same rows, order and words (`@repo/validation`'s
 * `people-settings-copy.ts`). `/roles` still redirects here.
 *
 * Nothing here waits on the chapter-config read, which needs
 * `chapter-config:view`; only the Default invite role row hides without it.
 */
export function SettingsRolesTab({
  canManage,
  configUnavailable,
  defaultInviteRoleId,
  onSaveDefaultInviteRole,
  isSavingConfig,
}: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: permissionsPayload } = useMyPermissions();
  const permissions = permissionsPayload?.permissions;
  const [query, setQuery] = useState("");
  // A `groups:manage` holder without `roles:manage` or config access reaches
  // this tab for its groups only (`settings-access.ts`).
  const canSeeRoles = canAny(
    ["roles:manage", "chapter-config:view"],
    permissions,
  );
  const canManageGroups = can("groups:manage", permissions);
  const isPresident = permissions?.includes("*") ?? false;
  const tierId = searchParams.get("tier");
  const roleId = searchParams.get("role");
  const groupId = searchParams.get("group");
  const groupsPage = searchParams.get("groups");
  const fromAutomatic = searchParams.get("from") === AUTOMATIC;

  const links = useMemo(
    () => ({
      tier: (id: string) => `${BASE}&tier=${encodeURIComponent(id)}`,
      role: (id: string) => `${BASE}&role=${encodeURIComponent(id)}`,
      group: (id: string) => `${BASE}&group=${encodeURIComponent(id)}`,
      automatic: `${BASE}&groups=${AUTOMATIC}`,
    }),
    [],
  );
  const backToRoles = () => router.push(BASE);

  if (tierId) {
    return (
      <TierPermissionsPage
        tierId={tierId}
        backHref={BASE}
        roleHref={links.role}
        onDeleted={backToRoles}
      />
    );
  }
  if (roleId) {
    return <RolePage roleId={roleId} backHref={BASE} onDeleted={backToRoles} />;
  }
  if (groupId) {
    const backHref = fromAutomatic ? links.automatic : BASE;
    return (
      <GroupPage
        groupId={groupId}
        canManage={canManageGroups}
        backHref={backHref}
        backLabel={
          fromAutomatic
            ? PEOPLE_SETTINGS_COPY.autoGroupsRow
            : PEOPLE_SETTINGS_COPY.pageTitle
        }
        onDone={() => router.push(backHref)}
      />
    );
  }
  if (groupsPage === AUTOMATIC) {
    return (
      <AutomaticGroupsPage
        backHref={BASE}
        groupHref={(id) => `${links.group(id)}&from=${AUTOMATIC}`}
      />
    );
  }

  return (
    <div className="space-y-8">
      {/*
        Outside any `roles:manage` check: the member who can claim a vacant
        presidency is by definition not the President, the role that holds
        `roles:manage` by default.
      */}
      <PresidencyClaimBanner />
      <PageHead canSeeRoles={canSeeRoles} query={query} onQuery={setQuery} />
      {canSeeRoles ? (
        <RolesOverview
          query={query}
          links={links}
          onOpenRole={(id) => router.push(links.role(id))}
        />
      ) : null}
      {/*
        Groups on the same page as the roles (Paul, 2026-11-19): one place
        for who is what, roles for what someone can do, groups for who they
        belong with.
      */}
      <GroupsGroup
        canManage={canManageGroups}
        query={query}
        links={links}
        onCreated={(id) => router.push(links.group(id))}
      />
      {normalizeWords(query).length === 0 &&
      (!configUnavailable || isPresident) ? (
        <SettingsGroup
          heading={PEOPLE_SETTINGS_COPY.invitesHeading}
          footnote={INVITES_FOOTNOTE}
        >
          {configUnavailable ? null : (
            <DefaultInviteRoleRow
              canManage={canManage}
              defaultInviteRoleId={defaultInviteRoleId}
              onSave={onSaveDefaultInviteRole}
              isSaving={isSavingConfig}
            />
          )}
          {isPresident ? <TransferPresidencyRow /> : null}
        </SettingsGroup>
      ) : null}
    </div>
  );
}

/**
 * The page's title, how many roles it holds, and its search: past 8 roles and
 * groups, as Discord's role list gains a search at a hundred roles. The
 * search reaches roles and groups alike, the same on the phone.
 */
function PageHead({
  canSeeRoles,
  query,
  onQuery,
}: {
  canSeeRoles: boolean;
  query: string;
  onQuery: (next: string) => void;
}) {
  const { rolesQuery, tiersQuery, roles, tiers, words } = useRolesData();
  const groupsQuery = useGroups();
  const groups = groupsQuery.data ?? [];
  const searchable = (canSeeRoles ? roles.length : 0) + groups.length > 8;
  const filtering = normalizeWords(query).length > 0;
  const nothingMatches =
    filtering &&
    !(
      canSeeRoles && roles.some((role) => matchesWordStarts(role.name, query))
    ) &&
    !groups.some((group) => matchesWordStarts(groupDisplayName(group), query));

  return (
    <div className="space-y-4">
      <div className="space-y-0.5">
        <h2 className="text-title text-foreground">
          {PEOPLE_SETTINGS_COPY.pageTitle}
        </h2>
        {canSeeRoles && rolesQuery.isSuccess && tiersQuery.isSuccess ? (
          <p className="text-sm text-muted-foreground">
            {`${roles.length} ${roles.length === 1 ? "role" : "roles"} in ${tiers.length} ${tiers.length === 1 ? words.singular : words.plural}`}
          </p>
        ) : null}
      </div>
      {searchable || filtering ? (
        <label className="relative block w-full max-w-sm">
          <span className="sr-only">{PEOPLE_SETTINGS_COPY.search}</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onQuery("");
            }}
            placeholder={PEOPLE_SETTINGS_COPY.search}
            className="pl-9"
          />
        </label>
      ) : null}
      {nothingMatches ? (
        <p role="status" className="text-sm text-muted-foreground">
          Nothing matches &ldquo;{query.trim()}&rdquo;.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The picker's "no default" choice. Radix `Select` reads an empty-string value
 * as "nothing picked, show the placeholder", so an item cannot carry it: the
 * choice carries this sentinel and `onValueChange` turns it back into the
 * `null` the API clears the setting with.
 */
const NO_DEFAULT_INVITE_ROLE = "__no-default__";

const VALUE_TRIGGER =
  "h-8 w-auto max-w-[14rem] gap-1.5 border-transparent bg-transparent px-2 text-sm text-muted-foreground hover:bg-card-hover";

/**
 * Default invite role (#422), a row of Invites and presidency (#6029; a
 * section of its own until then): the role an invite grants when it picks
 * none. Its value opens the role list and saves on the pick, as a settings
 * pick does. "No role" is a real choice: it writes `null`, and a new member
 * then holds only what Everyone gets. The choices are the phone's too
 * (`defaultInviteRoleChoices`).
 */
function DefaultInviteRoleRow({
  canManage,
  defaultInviteRoleId: configuredDefaultId,
  onSave,
  isSaving,
}: {
  canManage: boolean;
  defaultInviteRoleId: string | null;
  onSave: (roleId: string | null) => Promise<void> | void;
  isSaving?: boolean;
}) {
  const rolesQuery = useRoles();
  const invitableQuery = useInvitableRoleIds({ enabled: canManage });
  const roles = useMemo(
    () => parseChapterRoles(rolesQuery.data),
    [rolesQuery.data],
  );
  const { options, selectedId, dangling } = defaultInviteRoleChoices(
    roles,
    configuredDefaultId,
    invitableQuery.data,
  );
  const selectedName =
    selectedId === null
      ? PEOPLE_SETTINGS_COPY.noDefaultInviteRole
      : (options.find((role) => role.id === selectedId)?.name ?? "");
  // A configured role with no matching item (roles still loading, failed to
  // load, or the role is gone) gets the empty value, so Radix never holds an
  // id it has no item for.
  const pickerValue =
    selectedId === null
      ? NO_DEFAULT_INVITE_ROLE
      : options.some((role) => role.id === selectedId)
        ? selectedId
        : "";

  return (
    <SettingsRow
      icon={UserPlus}
      label={PEOPLE_SETTINGS_COPY.defaultInviteRole}
      description={
        dangling ? (
          <span className="text-warning">That role is gone. Pick another.</span>
        ) : rolesQuery.isError ? (
          <span className="text-destructive-text">
            Roles could not load, so this can&apos;t change right now.
          </span>
        ) : undefined
      }
      control={
        <Select
          value={pickerValue}
          disabled={
            !canManage || isSaving || rolesQuery.isPending || rolesQuery.isError
          }
          onValueChange={(next) => {
            void onSave(next === NO_DEFAULT_INVITE_ROLE ? null : next);
          }}
        >
          <SelectTrigger
            aria-label={PEOPLE_SETTINGS_COPY.defaultInviteRole}
            className={VALUE_TRIGGER}
          >
            <SelectValue
              placeholder={
                rolesQuery.isPending ? "Loading roles…" : "Pick a role"
              }
            >
              {pickerValue === "" ? undefined : selectedName}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value={NO_DEFAULT_INVITE_ROLE}>
              {PEOPLE_SETTINGS_COPY.noDefaultInviteRole}
            </SelectItem>
            {options.map((role) => (
              <SelectItem key={role.id} value={role.id}>
                {role.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  );
}
