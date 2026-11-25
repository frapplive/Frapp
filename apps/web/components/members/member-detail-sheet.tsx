"use client";

import { useId, useMemo, useState } from "react";
import {
  ChevronDown,
  Loader2,
  MessageSquare,
  Pencil,
  Timer,
  UserMinus,
} from "lucide-react";
import { SectionSkeleton } from "@/components/shared/page-skeletons";
import { SkeletonText } from "@/components/shared/async-states";
import {
  useLiftChatTimeout,
  useMemberByUserId,
  useMemberDisplayNames,
  useMyPermissions,
  useNowDate,
  useRemoveMember,
} from "@repo/hooks";
import { errorCopy } from "@repo/hooks/error-copy";
import { CHAT_TIMEOUT_COPY } from "@repo/chat-core/chat-timeout";
import { TimeoutMemberDialog } from "./timeout-member-dialog";
import {
  BIRTHDAY_COPY,
  can,
  CORRECTION_MENU_LABEL,
  formatBirthday,
  isChatTimeoutActive,
  phoneHref,
} from "@repo/validation";
import {
  formatCustomFieldValue,
  formatDay,
  formatPhone,
} from "@repo/formatting";
import { useToast } from "@/lib/hooks/use-toast";
import { useMessageMember } from "@/lib/chat/use-message-member";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ActionMenuButton } from "@/components/shared/row-menu";
import { useSubscriptionGate } from "@/components/shared/subscription-gate";
import { PointsAdjustmentDialog } from "@/components/points/points-adjustment-dialog";
import { AdjustGlyph } from "@/components/points/points-glyphs";
import { ADJUST_POINTS_LABEL } from "@repo/validation";
import { pointsLedgerPath } from "@/components/settings/settings-paths";
import { useChapterModuleGateState } from "@/lib/hooks/use-chapter-module-gate";
import { FOCUS_RING_OFFSET } from "@/components/ui/focus";
import {
  Panel,
  PanelBody,
  PanelContent,
  PanelHeader,
  PanelTitle,
  type PanelDocking,
} from "@/components/shared/panel";
import { useConfirmDialog } from "@/components/shared/confirm-dialog";
import { asArray, cn, getErrorMessage, initials } from "@/lib/utils";
import { memberLabel } from "@repo/hooks/display-names";
import { useMemberPhoneReach } from "@repo/hooks";
import {
  PHONE_REACH_LABEL,
  phoneReachLastOpened,
  phoneReachSummary,
} from "@repo/validation";
import {
  memberMenuButtonLabel,
  REMOVE_CONFIRM_BODY,
  REMOVE_FROM_CHAPTER_LABEL,
  removeConfirmTitle,
} from "@repo/hooks/member-removal-copy";
import {
  DETAIL_LIST,
  DetailRow,
  metaLine,
  stringField,
  stringIds,
  type MemberRecord,
} from "@/components/members/member-detail-rows";
import { MemberAssignments } from "@/components/members/member-assignments";
import { MemberPledgeClassSection } from "@/components/members/member-pledge-class-section";
import { useIsCouncil } from "@/lib/hooks/use-tenant-kind";
import { MemberCorrectionDialog } from "@/components/members/member-correction-dialog";

type CustomFieldValue = {
  field_id: string;
  label: string;
  type: string;
  value: string | null;
};

function formatCustomValue(
  field: CustomFieldValue & { value: string },
): string {
  return formatCustomFieldValue(field.type, field.value) ?? field.value;
}

/**
 * `MemberProfileDto.custom_fields`, already filtered server-side to the tiers
 * the viewer may see (`spec/behavior/members.md` § Custom Fields), so the
 * sheet gates none. A field with no value is left out, and with none set
 * More details itself goes (`spec/behavior/members.md` § Custom Fields).
 */
function parseCustomFields(
  member: MemberRecord | null,
): (CustomFieldValue & { value: string })[] {
  return asArray<Record<string, unknown>>(member?.custom_fields).flatMap(
    (entry) => {
      if (
        !entry ||
        typeof entry.field_id !== "string" ||
        typeof entry.label !== "string" ||
        typeof entry.type !== "string" ||
        typeof entry.value !== "string" ||
        entry.value.trim() === ""
      ) {
        return [];
      }
      return [
        {
          field_id: entry.field_id,
          label: entry.label,
          type: entry.type,
          value: entry.value,
        },
      ];
    },
  );
}

type MemberDetailSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Whose profile, by `users.id`, or `null` while nobody is selected; the
   * sheet stays mounted regardless. Read through
   * `GET /v1/members/by-user/{userId}`, which also hands back the membership
   * id a role edit or removal takes, so chat can open it with only a sender
   * or mention id (#3726).
   */
  userId: string | null;
  /**
   * The directory row that opened the sheet, drawn while the profile read is
   * in flight so a row click never opens onto a skeleton. Ignored unless its
   * `user_id` is {@link userId}.
   */
  initialMember?: MemberRecord | null;
  /**
   * The name and photo the opener already holds (chat's roster), drawn in the
   * identity block until the profile read lands, so the sheet never opens
   * titled "Member 3f9a1c" for someone chat just named, and keeps their name
   * if the read fails.
   */
  identity?: { name: string | null; avatarUrl: string | null } | null;
  /**
   * The member's point balance, which only the directory has (from the
   * leaderboard it already reads). Omitted elsewhere rather than faked: the
   * per-member read needs `points:view_all`, which most viewers lack.
   */
  points?: number | null;
  /**
   * Open inside the page that lists the member (Directory, Alumni) rather
   * than over everything (`Panel`'s `docked`, components.md § Surface size).
   * Chat, which has no page of its own for a member, docks it `"here"`: over
   * the chat column, with a way back to the channel.
   */
  docked?: PanelDocking;
  /** The docked back arrow's name: where it goes ("Back to directory"). */
  backLabel?: string;
};

/**
 * A member's profile: one sheet for every door on web (#3726), keyed by
 * `users.id`, so a member sees the same card wherever they click a name. The
 * directory's Actives and Alumni rows open it directly. In chat a sender's
 * name or photo, an `@` chip and a member-list row open the small
 * `MemberPopout` beside them first, and this sheet is its View profile
 * (#4593). Mobile's member profile
 * (`apps/mobile/components/directory/member-profile-screen.tsx`, a pushed
 * screen since #5568, with the photo and name on its title row) is the
 * reference, and this draws its order: photo, name and the class-year line,
 * Message, then how to reach them (phone, email) with member since, roles as
 * colored chips in the chapter's rank, pledge class, the custom fields the
 * viewer may see folded under More details, and the bio.
 *
 * **A contact card first** (#3711). A profile is opened to reach someone, so
 * their phone and email come right under Message, before roles (Evan,
 * 2026-11-10: "Contact info in the profile"). The phone is the member's own
 * (`PATCH /v1/users/me`) and is a `tel:` link. A chapter's custom fields
 * (T-shirt size, dietary, emergency contact) are logistics, not why a profile
 * is opened, so they sit behind a More details row, closed on every opening
 * (Shawn, 2026-11-09).
 *
 * **Header.** No title word and no name in the title row: the name heads the
 * body under the photo, and the row carries the close (as a sheet) or the
 * back arrow (`docked`, in the Directory) plus the `⋯` when it has rows, as
 * `components.md` § Surface size has the member sheet do. The name is the
 * surface's title (`PanelTitle`: the sheet's `SheetTitle`, or the docked
 * region's heading), so it is still announced by it.
 *
 * **Roles and groups** (Paul, 2026-11-19) sit right under Message as two
 * rows of chips, `MemberAssignments`: a viewer who may change them takes one
 * away with its x and gives one from a single "+ Add" list of roles and
 * groups, each saving at once. There is no Edit mode and no Save footer.
 *
 * **Remove from chapter** sits behind the `⋯` beside the close, never on the
 * face of the profile (Paul, 2026-11-11: nobody opens a profile to remove
 * someone, and it was drawn as a big red button on his own). The `⋯` is drawn
 * only when the API says this viewer may remove this member
 * (`viewer_can_remove`: `members:remove`, not their own profile, and the
 * member ranks below them), so it is never on your own profile, and a chair
 * never sees it on an officer's. It still asks before removing.
 *
 * **Pledge class and order number** (#3939) sit under the roles, in the
 * chapter's own words; `MemberPledgeClassSection` owns them.
 *
 * **Edit name and graduation year** (#4367) is in the same `⋯`, for an officer
 * the API says may fix them (`viewer_can_edit_profile`: `roles:manage`, the
 * member ranks below them or at their own rank (#5900), and is in no other
 * chapter). It opens
 * `MemberCorrectionDialog`. Nothing else on someone's profile is an officer's
 * to change.
 */
export function MemberDetailSheet({
  open,
  onOpenChange,
  userId,
  initialMember,
  identity,
  points,
  docked = false,
  backLabel,
}: MemberDetailSheetProps) {
  const memberQuery = useMemberByUserId(userId ?? "");
  // Whether Frapp's notifications reach this member's phone. The server sends
  // every member's only to officers who can invite or manage roles, and
  // anyone else only their own, so a missing entry draws no row.
  const { reach: phoneReachMap } = useMemberPhoneReach();
  const phoneReach = userId ? phoneReachMap?.byUserId.get(userId) : undefined;
  const phoneLastOpened = phoneReach ? phoneReachLastOpened(phoneReach) : null;
  // The same role-color resolution chat's name uses (#3860).
  const { avatarTintFor } = useMemberDisplayNames();
  const myPermissionsQuery = useMyPermissions();
  const myPermissions = myPermissionsQuery.data?.permissions;
  const isCouncil = useIsCouncil();
  const removeMemberMutation = useRemoveMember();
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirmDialog();
  // Whose More details are open, keyed by member, so the
  // custom fields start folded on every member and every opening.
  const [detailsUserId, setDetailsUserId] = useState<string | null>(null);
  if (!open && detailsUserId !== null) setDetailsUserId(null);
  const detailsOpen = open && userId !== null && detailsUserId === userId;
  const detailsRegionId = useId();
  const [correcting, setCorrecting] = useState(false);
  if (!open && correcting) setCorrecting(false);
  // Adjust points starts from the member it is for (#5950; the Points page's
  // own button until then, which asked who). `POST /v1/points/adjust` is
  // paid-ops, so the item is held while the chapter's plan blocks writes.
  const [adjusting, setAdjusting] = useState(false);
  if (!open && adjusting) setAdjusting(false);
  // Time out (#6006): the dialog the chat's message menu opens too.
  const [timingOut, setTimingOut] = useState(false);
  if (!open && timingOut) setTimingOut(false);
  const liftTimeout = useLiftChatTimeout();
  const now = useNowDate();
  const adjustGate = useSubscriptionGate();
  const moduleGate = useChapterModuleGateState();
  const pointsOn =
    moduleGate.status === "ready" && moduleGate.isModuleEnabled("points");

  const fetched =
    memberQuery.data && typeof memberQuery.data === "object"
      ? (memberQuery.data as MemberRecord)
      : null;
  const seed =
    initialMember && userId && initialMember.user_id === userId
      ? initialMember
      : null;
  const member: MemberRecord | null = fetched ?? seed;

  const memberId = stringField(member, "id");
  const memberRoleIds = useMemo(
    () => stringIds(member?.role_ids),
    [member?.role_ids],
  );
  // `memberLabel`, the helper the directory row uses: this sheet opens from
  // that row, so the two must not name an unnamed member two different ways.
  const seedIdentity = !member && userId ? identity : null;
  const displayName = memberLabel(
    member?.display_name ?? seedIdentity?.name,
    member?.user_id ?? userId,
  );
  const avatarUrl =
    stringField(member, "avatar_url") ?? seedIdentity?.avatarUrl ?? null;
  const meta = metaLine(member);
  const email = stringField(member, "email");
  const phone = stringField(member, "phone");
  // Present only when the member shares it with the chapter (#4959).
  const birthdayMonth = member?.birthday_month;
  const birthdayDay = member?.birthday_day;
  const birthday =
    typeof birthdayMonth === "number" && typeof birthdayDay === "number"
      ? formatBirthday(birthdayMonth, birthdayDay)
      : "";
  const phoneLink = phoneHref(phone, "call");
  const textLink = phoneHref(phone, "text");
  const joined = formatDay(member?.created_at);
  const bio = stringField(member, "bio");
  const onboardingPending = member?.has_completed_onboarding === false;
  const customFields = useMemo(() => parseCustomFields(member), [member]);

  // Null rather than a placeholder, so the Message button and its handler can
  // never fire a DM request at a fallback string. The sheet stays mounted and
  // swaps members, and `useMessageMember` drops a DM that resolves for the
  // member it has moved on from.
  const dmTargetUserId = stringField(member, "user_id");
  const {
    canMessage,
    currentUserId,
    startMessage: handleMessage,
    isPending: dmPending,
  } = useMessageMember(dmTargetUserId, () => onOpenChange(false));

  // The API's answer, read from the profile itself (never the directory row
  // that seeded the sheet, which carries none): it applies the rank rules the
  // removal does, which the client can't see (#4071).
  const canRemove =
    !!memberId &&
    !memberQuery.isError &&
    fetched?.viewer_can_remove === true &&
    dmTargetUserId !== currentUserId;
  // The same kind of answer for fixing their name and year (#4367), from the
  // profile read only, never the directory row that seeded the sheet.
  const canCorrect =
    !!memberId &&
    !memberQuery.isError &&
    fetched?.viewer_can_edit_profile === true &&
    dmTargetUserId !== currentUserId;
  const graduationYear =
    typeof member?.graduation_year === "number" ? member.graduation_year : null;
  // Never against yourself: the API refuses an officer's own points
  // (`PointsService`), so the item isn't offered on your own card.
  const canAdjustPoints =
    pointsOn &&
    !!memberId &&
    !!dmTargetUserId &&
    dmTargetUserId !== currentUserId &&
    can("points:adjust", myPermissions);
  const canSeeLedger = pointsOn && can("points:view_all", myPermissions);
  // The API's answer (`viewer_can_timeout`: `members:timeout`, not your own
  // profile, not the President, and ranked below you), from the profile read
  // only, like Remove's. The running timeout comes with it, to the member
  // and to whoever can time out.
  const canTimeOut =
    !!memberId &&
    !memberQuery.isError &&
    fetched?.viewer_can_timeout === true &&
    dmTargetUserId !== currentUserId;
  const storedTimeout = stringField(fetched, "chat_timeout_until");
  const timedOutUntil =
    storedTimeout && isChatTimeoutActive(storedTimeout, now.getTime())
      ? storedTimeout
      : null;
  const timeoutReason = stringField(fetched, "chat_timeout_reason");

  async function handleLiftTimeout() {
    if (!memberId) return;
    const confirmed = await confirm({
      title: CHAT_TIMEOUT_COPY.liftConfirmTitle(displayName),
      description: CHAT_TIMEOUT_COPY.liftConfirmBody,
      confirmLabel: CHAT_TIMEOUT_COPY.lift,
    });
    if (!confirmed) return;
    try {
      await liftTimeout.mutateAsync({ memberId });
    } catch (error) {
      toast({
        title: CHAT_TIMEOUT_COPY.liftFailed,
        description: errorCopy(error, CHAT_TIMEOUT_COPY.liftFailed, {
          serverWritesForMembers: true,
        }),
        variant: "destructive",
      });
    }
  }

  async function handleRemoveMember() {
    if (!memberId) return;
    // `confirmLabel` names the verb and its object rather than saying
    // "Confirm" (`writing.md` §2). Browser-chrome dialogs are banned on every
    // surface (`design-system/README.md` §2).
    const confirmed = await confirm({
      title: removeConfirmTitle(displayName),
      description: REMOVE_CONFIRM_BODY,
      confirmLabel: REMOVE_FROM_CHAPTER_LABEL,
      tone: "destructive",
    });
    if (!confirmed) return;

    try {
      await removeMemberMutation.mutateAsync(memberId);
      toast({
        title: "Member removed",
        description: `${displayName} was removed from the chapter roster.`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Could not remove member",
        description: getErrorMessage(
          error,
          "Something went wrong. Please retry.",
        ),
        variant: "destructive",
      });
    }
  }

  return (
    <Panel
      open={open}
      onOpenChange={onOpenChange}
      docked={docked}
      backLabel={backLabel}
    >
      {/*
        `aria-describedby={undefined}`: with no `SheetDescription` rendered,
        Radix warns on every open for a `Content` that points at a description
        id that does not exist.
      */}
      <PanelContent aria-describedby={undefined}>
        {/*
          The title row's band with no title in it: the name heads the body.
          The sheet's close button sits at its end (docked, the back arrow
          leads it instead), and the `⋯`
          beside it holds what a viewer only now and then reaches for
          (components.md § Settings live a couple of taps away), never on the
          profile's face. Absent when it would hold nothing.
        */}
        <PanelHeader
          actions={
            canRemove || canCorrect || canAdjustPoints || canTimeOut ? (
              <ActionMenuButton
                label={memberMenuButtonLabel(displayName)}
                busy={removeMemberMutation.isPending || liftTimeout.isPending}
                entries={[
                  // Most used first; the one aimed at the person's place in
                  // the chapter stays last (rulebook § 2).
                  ...(canAdjustPoints
                    ? [
                        {
                          type: "item" as const,
                          key: "adjust-points",
                          label: ADJUST_POINTS_LABEL,
                          icon: AdjustGlyph,
                          disabled: !adjustGate.allowed,
                          title: adjustGate.controlProps().title,
                          onSelect: () => setAdjusting(true),
                        },
                      ]
                    : []),
                  ...(canCorrect
                    ? [
                        {
                          type: "item" as const,
                          key: "correct",
                          label: CORRECTION_MENU_LABEL,
                          icon: Pencil,
                          onSelect: () => setCorrecting(true),
                        },
                      ]
                    : []),
                  // Moderation, before the removal it stops short of.
                  ...(canTimeOut
                    ? [
                        timedOutUntil
                          ? {
                              type: "item" as const,
                              key: "lift-timeout",
                              label: CHAT_TIMEOUT_COPY.lift,
                              icon: Timer,
                              onSelect: () => void handleLiftTimeout(),
                            }
                          : {
                              type: "item" as const,
                              key: "time-out",
                              label: CHAT_TIMEOUT_COPY.action,
                              icon: Timer,
                              onSelect: () => setTimingOut(true),
                            },
                      ]
                    : []),
                  ...(canRemove
                    ? [
                        {
                          type: "item" as const,
                          key: "remove",
                          label: REMOVE_FROM_CHAPTER_LABEL,
                          icon: UserMinus,
                          destructive: true,
                          onSelect: () => void handleRemoveMember(),
                        },
                      ]
                    : []),
                ]}
              />
            ) : undefined
          }
        />
        {/* `gap-0`: the blocks below carry their own top margins. */}
        <PanelBody className="gap-0">
          <div className="flex flex-col items-center gap-2 text-center">
            {/*
              The initials sit on `--card` with a hairline: the fallback's
              own `--popover` is this sheet's fill, so it drew no circle. A
              member's tint (#3860) replaces the `--card` fill; the hairline
              stays, so the circle's edge reads the same either way.
            */}
            <Avatar className="h-20 w-20" aria-hidden="true">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
              <AvatarFallback
                tint={userId ? avatarTintFor(userId) : null}
                className="border border-border bg-card text-lg font-bold text-muted-foreground"
              >
                {initials(displayName)}
              </AvatarFallback>
            </Avatar>
            <PanelTitle className="break-words text-lg font-bold leading-[26px]">
              {displayName}
            </PanelTitle>
            {meta ? (
              <p className="text-caption text-muted-foreground">{meta}</p>
            ) : null}
            {timedOutUntil ? (
              <p className="text-caption text-warning-text">
                {CHAT_TIMEOUT_COPY.until(timedOutUntil, now)}
                {timeoutReason ? ` · ${timeoutReason}` : ""}
              </p>
            ) : null}
          </div>

          {!member && memberQuery.isPending ? (
            // A skeleton, not a spinner and caption (`components.md` §10).
            <SectionSkeleton label="Loading member profile" className="mt-6">
              <SkeletonText lines={4} />
            </SectionSkeleton>
          ) : null}

          {/*
            A cached member still renders through a background-refetch failure
            (TanStack keeps `data` on an errored refetch); the error takes over
            only when there is nothing else to show.
          */}
          {!fetched && memberQuery.isError ? (
            <div
              role="alert"
              className="mt-6 flex items-center justify-between gap-3 rounded-md border border-destructive/[.28] bg-destructive-tint p-3 text-sm text-destructive-text"
            >
              <span>Couldn&apos;t load this member&apos;s profile.</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void memberQuery.refetch()}
                disabled={memberQuery.isFetching}
              >
                Retry
              </Button>
            </div>
          ) : null}

          {member ? (
            <>
              {canMessage ? (
                <Button
                  // Sized to its label under the name, not a full-width bar
                  // (Paul, 2026-11-20: "not a big huge button guy"), as
                  // Slack's and iOS Contacts' profiles draw their Message.
                  // `shrink-0`: the body is a flex column that scrolls.
                  variant="secondary"
                  size="sm"
                  className="mx-auto mt-4 shrink-0 gap-2"
                  onClick={handleMessage}
                  disabled={dmPending}
                >
                  {dmPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MessageSquare className="h-4 w-4" />
                  )}
                  Message
                </Button>
              ) : null}

              {userId ? (
                <MemberAssignments
                  memberId={memberId}
                  userId={userId}
                  roleIds={memberRoleIds}
                  displayName={displayName}
                  // Waits for the profile read: a write from the directory
                  // row that seeded the sheet could drop a role it lacks.
                  editable={fetched !== null && !memberQuery.isError}
                />
              ) : null}

              <dl className={cn("mt-6", DETAIL_LIST)}>
                {phone ? (
                  <DetailRow label="Phone">
                    {phoneLink ? (
                      <a
                        href={phoneLink}
                        className={cn(
                          "rounded-sm underline-offset-2 hover:underline",
                          FOCUS_RING_OFFSET,
                        )}
                      >
                        {formatPhone(phone)}
                      </a>
                    ) : (
                      formatPhone(phone)
                    )}
                    {textLink ? (
                      <>
                        {" · "}
                        <a
                          href={textLink}
                          aria-label={`Text ${displayName}`}
                          className={cn(
                            "rounded-sm underline-offset-2 hover:underline",
                            FOCUS_RING_OFFSET,
                          )}
                        >
                          Text
                        </a>
                      </>
                    ) : null}
                  </DetailRow>
                ) : null}
                {email ? (
                  <DetailRow label="Email">
                    <a
                      href={`mailto:${email}`}
                      className={cn(
                        "rounded-sm underline-offset-2 hover:underline",
                        FOCUS_RING_OFFSET,
                      )}
                    >
                      {email}
                    </a>
                  </DetailRow>
                ) : null}
                {birthday ? (
                  <DetailRow label={BIRTHDAY_COPY.label}>{birthday}</DetailRow>
                ) : null}
                <DetailRow label="Member since">
                  {joined ?? "Not recorded"}
                </DetailRow>
                {typeof points === "number" ? (
                  <DetailRow label="Points">
                    {points}
                    {/* The transactions behind the number, for a role that
                        may read them: the chapter ledger, on this member. */}
                    {canSeeLedger && dmTargetUserId ? (
                      <>
                        {" · "}
                        <Link
                          href={pointsLedgerPath(dmTargetUserId)}
                          className={cn(
                            "rounded-sm underline underline-offset-2",
                            FOCUS_RING_OFFSET,
                          )}
                        >
                          Ledger
                        </Link>
                      </>
                    ) : null}
                  </DetailRow>
                ) : null}
                {phoneReach ? (
                  <DetailRow label={PHONE_REACH_LABEL}>
                    <span className="flex flex-col">
                      <span>{phoneReachSummary(phoneReach)}</span>
                      {phoneLastOpened ? (
                        <span className="text-caption text-muted">
                          {phoneLastOpened}
                        </span>
                      ) : null}
                    </span>
                  </DetailRow>
                ) : null}
                {onboardingPending ? (
                  <DetailRow label="Onboarding">
                    <Badge variant="warning">Pending</Badge>
                  </DetailRow>
                ) : null}
              </dl>

              <MemberPledgeClassSection
                // Keyed by member, so an open editor never carries over to
                // the next member the sheet shows.
                key={memberId ?? "none"}
                open={open}
                memberId={memberId}
                displayName={displayName}
                pledgeClassId={stringField(member, "pledge_class_id")}
                orderNumber={
                  typeof member.order_number === "number"
                    ? member.order_number
                    : null
                }
                // Waits for the profile read: the write sets both fields, so
                // an edit seeded from the directory row that opened the sheet
                // could save a class or number that row no longer has.
                canEdit={
                  !!memberId &&
                  fetched !== null &&
                  !memberQuery.isError &&
                  can("roles:manage", myPermissions) &&
                  // Pledge classes are a chapter's (#5933): their routes
                  // refuse a council.
                  !isCouncil
                }
              />

              {customFields.length > 0 ? (
                <section className="mt-6 space-y-2">
                  <button
                    type="button"
                    aria-expanded={detailsOpen}
                    aria-controls={detailsRegionId}
                    onClick={() =>
                      setDetailsUserId(detailsOpen ? null : userId)
                    }
                    className={cn(
                      "flex w-full items-center justify-between rounded-md border border-border px-3 py-2.5 text-left text-sm hover:bg-card-hover",
                      FOCUS_RING_OFFSET,
                    )}
                  >
                    More details
                    <ChevronDown
                      aria-hidden="true"
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform",
                        detailsOpen && "rotate-180",
                      )}
                    />
                  </button>
                  {detailsOpen ? (
                    <dl id={detailsRegionId} className={DETAIL_LIST}>
                      {customFields.map((field) => (
                        <DetailRow key={field.field_id} label={field.label}>
                          {formatCustomValue(field)}
                        </DetailRow>
                      ))}
                    </dl>
                  ) : null}
                </section>
              ) : null}

              {bio ? (
                <p className="mt-6 whitespace-pre-wrap break-words rounded-md border border-border p-3 text-sm text-muted-foreground">
                  {bio}
                </p>
              ) : null}
            </>
          ) : null}
        </PanelBody>

        {/*
          Inside `SheetContent` so the confirmation renders above the sheet that
          opened it rather than behind its overlay. Focus on close is
          `useConfirmDialog`'s: back to the opener while it is usable, else into
          this sheet while it is still open (#2302).
        */}
        {confirmDialog}
        {canAdjustPoints && dmTargetUserId ? (
          <PointsAdjustmentDialog
            open={adjusting}
            onOpenChange={setAdjusting}
            member={{ userId: dmTargetUserId, name: displayName }}
          />
        ) : null}
        {canTimeOut && dmTargetUserId ? (
          <TimeoutMemberDialog
            target={
              timingOut ? { userId: dmTargetUserId, name: displayName } : null
            }
            onClose={() => setTimingOut(false)}
          />
        ) : null}
        {memberId && canCorrect ? (
          <MemberCorrectionDialog
            open={correcting}
            onOpenChange={setCorrecting}
            memberId={memberId}
            label={displayName}
            // The stored name, not the "Member 1a2b3c4d" label an unnamed
            // member shows as: the field opens blank for them.
            displayName={(stringField(member, "display_name") ?? "").trim()}
            graduationYear={graduationYear}
          />
        ) : null}
      </PanelContent>
    </Panel>
  );
}
