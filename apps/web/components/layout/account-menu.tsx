"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  Check,
  ChevronsUpDown,
  Landmark,
  LogOut,
  Plus,
  School,
  Settings,
  Smile,
  Sparkles,
  User,
} from "lucide-react";
import { useCurrentUser, useMemberDisplayNames } from "@repo/hooks";
import { CHAPTER_AFFILIATIONS_COPY, can } from "@repo/validation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/shared/async-states";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AvatarPresenceDot,
  PresenceGlyph,
} from "@/components/members/presence-dot";
import { CustomStatusDialog } from "@/components/layout/custom-status-dialog";
import { SETTINGS_TITLE } from "@/components/layout/page-title";
import { START_COUNCIL_ENTRY } from "@/components/councils/council-copy";
import { START_COUNCIL_PATH } from "@/lib/auth/join-visit";
import { useTenantKind } from "@/lib/hooks/use-tenant-kind";
import { useChapterPresenceContext } from "@/lib/providers/chapter-presence-provider";
import { useFrappUser } from "@/lib/auth/use-frapp-user";
import { useNetwork } from "@/lib/providers/network-provider";
import { useShellIdentity } from "@/lib/shell-cache/shell-cache-sync";
import {
  DND_DURATIONS,
  MEMBER_STATUS_HINT,
  clockTime,
  dndEndsAt,
  tomorrowMorning,
  untilLabel,
  type MemberStatus,
  type OwnStatus,
} from "@repo/hooks/member-status";
import { presenceLabel } from "@repo/hooks/presence-status";
import { useOwnStatus, useSaveOwnStatus } from "@/lib/realtime/use-own-status";
import { signOutCurrentSession } from "@/lib/auth/session";
import { useWhatsNewUnread } from "@/lib/whats-new";
import { cn, initials } from "@/lib/utils";
import { FOCUS_RING_SHELL } from "@/components/ui/focus";
import { useConfirmDropBulkUploads } from "@/components/backwork/bulk/use-confirm-drop-bulk-uploads";
import { PERSONAL_SETTINGS_PATH } from "@/components/personal-settings/personal-settings-sections";
import {
  membershipSubtitle,
  type ChapterSwitcher,
} from "@/components/layout/chapter-switcher";
import { hasSettingsDestination } from "@/components/settings/settings-access";
import { useNavPermissions } from "@/lib/hooks/use-nav-permissions";
import { useChapterModuleGate } from "@/lib/hooks/use-chapter-module-gate";

type CurrentUser = {
  display_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
};

/**
 * The member, at the foot of the sidebar, and the one menu they open (#5946,
 * Paul 2026-11-24: "copy the entire Claude sidebar system where the user
 * lives at the bottom and we have a menu with more settings for the user and
 * organization").
 *
 * **The row** is the member's avatar with their presence dot, their name,
 * and under it their custom status when they have set one, otherwise their
 * presence in words ("Online", "Do Not Disturb"), the way Discord's user
 * panel reads. In the rail it is the avatar alone.
 *
 * **The menu is one menu for the member and the chapter**, in three groups:
 *
 * 1. Theirs: Status and the custom status line (#3845, first because it is
 *    the row people reach for before practice, as on Discord and Slack),
 *    Profile, and Settings (the member's own page, #3856).
 * 2. The chapter's: Chapter settings, whenever Settings holds something for
 *    this viewer (`hasSettingsDestination`; without the check a member
 *    followed the link to a page with nothing they could use, #2946), Join
 *    another chapter, and the member's other chapters to switch to.
 * 3. What's new (the changelog, with a dot while an entry is unread, #3943)
 *    and Sign out.
 *
 * Until #5946 identity and chapter were two menus: this one on the top-bar
 * avatar, and the chapter's on the chapter's name atop the nav
 * (`chapter-nav-header.tsx`, deleted; board `1i` asked for the split). Paul's
 * note of 2026-11-19 made that chapter menu the one door into Chapter
 * settings; it is still one door, here.
 *
 * (The theme control that once lived here was deleted with next-themes in the
 * #920 shell slice — Signet is dark-only.)
 */
export function AccountMenu({
  variant,
  switcher,
  onNavigate,
}: {
  /** `foot`: the full row, in the sidebar and the drawer. `rail`: the avatar. */
  variant: "foot" | "rail";
  /** The member's chapters, from the sidebar's one read (`chapter-switcher.tsx`). */
  switcher: ChapterSwitcher;
  /**
   * Closes the mobile drawer behind a navigation, exactly as `ProtectedNavItem`
   * does. Without it the drawer and its overlay stay up over the page the
   * member just navigated to — the dropdown is a modal layer above the sheet,
   * so dismissing it does not register as an outside interaction on the sheet.
   * Sign out is unaffected either way; it does a full document navigation.
   */
  onNavigate?: () => void;
}) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [editingLine, setEditingLine] = useState(false);
  const own = useOwnStatus();
  // Entries this browser hasn't shown yet, or the quiet mark: another device
  // showed them first (#4043; both in `lib/whats-new.ts`). The dot is
  // neutral, as every unread mark is (components.md § Chrome weight).
  const whatsNewUnread = useWhatsNewUnread();
  const { data, isError, fetchStatus } = useCurrentUser();
  const { isOffline } = useNetwork();

  const user = (data ?? {}) as CurrentUser;
  // While `/v1/users/me` is out the row draws its own shape (an avatar disc
  // and a name bar) rather than a stand-in identity: "Your account" with "YA"
  // read as an account nobody had linked (#6121; rulebook § States, "no fake
  // or placeholder identity"). Out includes a retry paused in a hidden tab
  // (`fetchStatus` "paused" while online), which `isLoading` would call done.
  // A read that failed, can't run, or waits on a connection the browser
  // doesn't have shows the plain-words label instead, with a person glyph,
  // never initials made from it: offline is the connection pill's to say.
  const reading = !data && !isError && fetchStatus !== "idle" && !isOffline;
  // On a revisit the row paints the name and photo this browser last saw for
  // this member and chapter (#5049), and the live answer replaces them.
  const cached = useShellIdentity();
  const fromCache = reading && !!cached?.display_name;
  const identityLoading = reading && !fromCache;
  const ownName =
    user.display_name?.trim() || (fromCache ? cached.display_name : null);
  const ownAvatar =
    user.avatar_url ?? (fromCache ? cached.avatar_url : null) ?? null;
  const name = ownName ?? "Your account";
  const email = user.email ?? null;

  const { confirmDrop, confirmDropDialog } = useConfirmDropBulkUploads();
  // The one door into Chapter settings (Paul, 2026-11-19), so it asks: is
  // there anything there for this viewer?
  const permissions = useNavPermissions();
  const isModuleEnabled = useChapterModuleGate();
  // A council's settings are its own (#5933): the menu names them so.
  const tenantKind = useTenantKind();
  const showChapterSettings = hasSettingsDestination(
    permissions,
    isModuleEnabled,
  );
  // The chapter's School and council page (#5974): a chapter's officers who
  // read its config. A council has no school link of its own to manage here.
  const showAffiliationsLink =
    tenantKind === "chapter" && can("chapter-config:view", permissions ?? []);

  // Your own dot, on the avatar that opens this menu. Read from presence, so
  // it is what the chapter sees (the Idle clock included), except that
  // Invisible shows its grey ring to you alone.
  const { userId } = useFrappUser();
  const presence = useChapterPresenceContext();
  // Your initials wear the color the chapter sees on them (#3860).
  const { avatarTintFor } = useMemberDisplayNames();
  const ownTint = userId ? avatarTintFor(userId) : null;
  const ownDot = presence.isReady && userId ? presence.statusOf(userId) : null;
  // The dot is decorative (`AvatarPresenceDot`), so the control names it.
  const accountLabel = ownDot
    ? `Account menu for ${name}, ${presenceLabel(ownDot)}`
    : `Account menu for ${name}`;
  // Loading keeps the status the dot already shows; only the name waits.
  const loadingLabel = ownDot
    ? `Account menu, ${presenceLabel(ownDot)}`
    : "Account menu";
  // Under the name: what the member wrote, else their presence in words.
  const statusLine = own?.line ?? (ownDot ? presenceLabel(ownDot) : null);

  async function handleSignOut() {
    if (!(await confirmDrop("sign-out"))) return;
    setIsSigningOut(true);
    try {
      await signOutCurrentSession();
      window.location.assign("/sign-in");
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "rail" ? (
          /*
           * In the rail the control is the avatar alone. The name is still
           * the accessible name via `aria-label`.
           */
          <button
            type="button"
            aria-label={identityLoading ? loadingLabel : accountLabel}
            title={identityLoading ? undefined : name}
            className={cn(
              "grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] transition hover:bg-card",
              FOCUS_RING_SHELL,
            )}
          >
            <span className="relative block">
              {identityLoading ? (
                <Skeleton className="h-[26px] w-[26px] rounded-full" />
              ) : (
                <Avatar className="h-[26px] w-[26px] border border-border bg-popover">
                  {ownAvatar ? <AvatarImage src={ownAvatar} alt="" /> : null}
                  <AvatarFallback
                    className="text-[10px] font-semibold"
                    tint={ownTint}
                  >
                    {ownName ? (
                      initials(ownName)
                    ) : (
                      <User className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </AvatarFallback>
                </Avatar>
              )}
              <AvatarPresenceDot status={ownDot} />
            </span>
          </button>
        ) : (
          <button
            type="button"
            aria-label={identityLoading ? loadingLabel : accountLabel}
            data-member-row=""
            className={cn(
              // 44px: two lines beside a 32px avatar, and the touch floor in
              // the drawer.
              "flex min-h-11 w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left transition",
              "hover:bg-card data-[state=open]:bg-card",
              FOCUS_RING_SHELL,
            )}
          >
            <span className="relative shrink-0">
              {identityLoading ? (
                <Skeleton className="h-8 w-8 rounded-full" />
              ) : (
                <Avatar className="h-8 w-8 border border-border bg-popover">
                  {ownAvatar ? <AvatarImage src={ownAvatar} alt="" /> : null}
                  <AvatarFallback
                    className="text-xs font-semibold"
                    tint={ownTint}
                  >
                    {ownName ? (
                      initials(ownName)
                    ) : (
                      <User className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </AvatarFallback>
                </Avatar>
              )}
              <AvatarPresenceDot status={ownDot} />
            </span>
            <span className="min-w-0 flex-1">
              {identityLoading ? (
                // The name line's own height, so nothing moves when it lands.
                <span className="flex h-5 items-center">
                  <Skeleton className="h-[13px] w-24" />
                </span>
              ) : (
                <span className="block truncate text-sm font-medium leading-5 text-foreground">
                  {name}
                </span>
              )}
              {statusLine ? (
                <span className="block truncate text-caption leading-4 text-muted-foreground">
                  {statusLine}
                </span>
              ) : null}
            </span>
            <ChevronsUpDown
              className="h-4 w-4 shrink-0 text-muted"
              aria-hidden="true"
            />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side={variant === "rail" ? "right" : "top"}
        // The sidebar's width inside its 8px gutters, so the menu sits over
        // the column it belongs to and nothing else.
        className="w-[248px]"
      >
        <DropdownMenuLabel className="font-normal">
          {identityLoading ? (
            <Skeleton className="my-1 h-[13px] w-28" />
          ) : (
            <span className="block truncate text-sm font-medium">{name}</span>
          )}
          {email ? (
            <span className="block truncate text-xs text-muted-foreground">
              {email}
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <StatusRows own={own} onEditLine={() => setEditingLine(true)} />
        <DropdownMenuItem asChild>
          <Link href="/profile" onClick={onNavigate}>
            <User className="h-4 w-4" aria-hidden="true" />
            <span>Profile</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          {/* The member's own settings; the chapter's are in the group below. */}
          <Link href={PERSONAL_SETTINGS_PATH} onClick={onNavigate}>
            <Settings className="h-4 w-4" aria-hidden="true" />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {showChapterSettings ? (
          <DropdownMenuItem asChild>
            <Link href="/settings" onClick={onNavigate}>
              <Landmark className="h-4 w-4" aria-hidden="true" />
              <span>{SETTINGS_TITLE[tenantKind ?? "chapter"]}</span>
            </Link>
          </DropdownMenuItem>
        ) : null}
        {showAffiliationsLink ? (
          <DropdownMenuItem asChild>
            <Link href="/affiliations" onClick={onNavigate}>
              <School className="h-4 w-4" aria-hidden="true" />
              <span>{CHAPTER_AFFILIATIONS_COPY.title}</span>
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="/join" onClick={onNavigate}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Join another chapter</span>
          </Link>
        </DropdownMenuItem>
        {/*
          Start a council (#5933): the founder is nearly always already in
          their own chapter (an IFC's delegates are its chapters' members), so
          the way in sits beside joining another, as Discord's server list
          ends in Add a server.
        */}
        <DropdownMenuItem asChild>
          <Link href={START_COUNCIL_PATH} onClick={onNavigate}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>{START_COUNCIL_ENTRY.action}</span>
          </Link>
        </DropdownMenuItem>
        {switcher.otherChapters.length > 0 ? (
          <>
            <DropdownMenuLabel className="pb-1 pt-2 text-xs font-normal text-muted-foreground">
              {switcher.memberships.some((m) => m.kind === "council")
                ? "Switch chapter or council"
                : "Switch chapter"}
            </DropdownMenuLabel>
            {switcher.otherChapters.map((membership) => (
              <DropdownMenuItem
                key={membership.chapter_id}
                onSelect={() => switcher.select(membership.chapter_id)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {membership.chapter?.name ?? "Untitled chapter"}
                  </span>
                  {membershipSubtitle(membership) ? (
                    <span className="block truncate text-caption text-muted-foreground">
                      {membershipSubtitle(membership)}
                    </span>
                  ) : null}
                </span>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/whats-new" onClick={onNavigate}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span>What&apos;s new</span>
            {whatsNewUnread ? (
              <>
                <span
                  aria-hidden="true"
                  className="ml-auto h-1.5 w-1.5 rounded-full bg-foreground"
                />
                <span className="sr-only">, new</span>
              </>
            ) : null}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={isSigningOut}
          onSelect={(event) => {
            event.preventDefault();
            void handleSignOut();
          }}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          <span>{isSigningOut ? "Signing out..." : "Sign out"}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
      {confirmDropDialog}
      {editingLine ? (
        <CustomStatusDialog
          current={own?.line ?? null}
          onClose={() => setEditingLine(false)}
        />
      ) : null}
    </DropdownMenu>
  );
}

/**
 * The Status row (a submenu: Online, Idle, Do Not Disturb with its
 * durations, Invisible) and the custom status row under it (#3845).
 *
 * Writes go through the shared settings mutation, optimistically, so the dot
 * moves on the click. While the dashboard is offline both rows are disabled,
 * as the Profile notification switches are (`notifications.md` § Preference
 * sync): a status the server never heard of would show here and nowhere else.
 */
function StatusRows({
  own,
  onEditLine,
}: {
  own: OwnStatus | null;
  onEditLine: () => void;
}) {
  const { save } = useSaveOwnStatus();
  const { isOffline } = useNetwork();
  const current: MemberStatus = own?.status ?? "online";
  const disabled = isOffline || own === null;
  const now = new Date();

  function pick(status: MemberStatus, endsAt: string | null = null) {
    void save({ status, status_expires_at: endsAt });
  }

  function mark(status: MemberStatus) {
    return current === status ? (
      <Check className="ml-auto" aria-label="Current" />
    ) : null;
  }

  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger disabled={disabled}>
          <PresenceGlyph status={current} />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{presenceLabel(current)}</span>
            {own?.statusEndsAt ? (
              <span className="block truncate text-caption text-muted-foreground">
                {untilLabel(own.statusEndsAt, now)}
              </span>
            ) : null}
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-[240px]">
          <StatusItem status="online" onSelect={() => pick("online")}>
            {mark("online")}
          </StatusItem>
          <StatusItem status="idle" onSelect={() => pick("idle")}>
            {mark("idle")}
          </StatusItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <PresenceGlyph status="dnd" />
              <span className="min-w-0 flex-1">
                <span className="block">{presenceLabel("dnd")}</span>
                <span className="block text-caption text-muted-foreground">
                  {MEMBER_STATUS_HINT.dnd}
                </span>
              </span>
              {current === "dnd" ? <Check aria-label="Current" /> : null}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-[220px]">
              {DND_DURATIONS.map(({ duration, label }) => (
                <DropdownMenuItem
                  key={label}
                  onSelect={() => pick("dnd", dndEndsAt(duration, new Date()))}
                >
                  <span className="flex-1">{label}</span>
                  {duration === "tomorrow" ? (
                    <span className="text-caption text-muted-foreground">
                      {clockTime(tomorrowMorning(now))}
                    </span>
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <StatusItem
            status="invisible"
            hint={MEMBER_STATUS_HINT.invisible}
            onSelect={() => pick("invisible")}
          >
            {mark("invisible")}
          </StatusItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuItem disabled={disabled} onSelect={onEditLine}>
        <Smile aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">
          {own?.line ?? "Set a custom status"}
        </span>
      </DropdownMenuItem>
    </>
  );
}

function StatusItem({
  status,
  hint,
  onSelect,
  children,
}: {
  status: MemberStatus;
  hint?: string;
  onSelect: () => void;
  children?: ReactNode;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect}>
      <PresenceGlyph status={status} />
      <span className="min-w-0 flex-1">
        <span className="block">{presenceLabel(status)}</span>
        {hint ? (
          <span className="block text-caption text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </span>
      {children}
    </DropdownMenuItem>
  );
}
