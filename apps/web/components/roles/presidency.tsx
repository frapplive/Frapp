"use client";

import { ChevronRight, Crown, Loader2 } from "lucide-react";
import {
  useClaimPresidency,
  useCurrentChapter,
  useMembers,
  usePresidencyClaimStatus,
  useTransferPresidency,
  useViewerDisplayName,
  useViewerUserId,
  type MemberProfile,
} from "@repo/hooks";
import {
  PEOPLE_SETTINGS_COPY,
  transferPresidencyConfirm,
} from "@repo/validation";
import { memberLabel } from "@repo/hooks/display-names";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RolesGlyph } from "@/components/layout/nav-glyphs";
import { FOCUS_RING } from "@/components/ui/focus";
import { SearchablePicker } from "@/components/shared/searchable-picker";
import { SettingsRow } from "@/components/shared/settings-row";
import { useToast } from "@/lib/hooks/use-toast";
import { useConfirmDialog } from "@/components/shared/confirm-dialog";
import { cn, getErrorMessage } from "@/lib/utils";

/**
 * "This chapter needs a new President" recovery prompt
 * (spec/behavior/rbac.md § Presidency Transfer "Edge case").
 *
 * Rendered ABOVE the `roles:manage` gate on the Roles tab (`settings-roles-tab.tsx`),
 * not inside it: the eligible claimant is by definition not the (now-vacant)
 * President, and the default role pack only grants `roles:manage` to
 * President — so a member who needs to see this is exactly the member the
 * gate would otherwise hide it from.
 */
export function PresidencyClaimBanner() {
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirmDialog();
  const chapterQuery = useCurrentChapter();
  const needsPresident = chapterQuery.data?.needs_president ?? false;
  const statusQuery = usePresidencyClaimStatus({ enabled: needsPresident });
  const claimPresidency = useClaimPresidency();

  if (!needsPresident) return null;

  async function handleClaim() {
    const confirmed = await confirm({
      title: "Claim the presidency?",
      description:
        "You will immediately hold every permission the President role carries. Only a future presidency transfer can move it again.",
      confirmLabel: "Claim presidency",
    });
    if (!confirmed) return;
    try {
      await claimPresidency.mutateAsync();
      toast({
        title: "Presidency claimed",
        description: "You are now the President of this chapter.",
      });
    } catch (error) {
      toast({
        title: "Couldn't claim presidency",
        description: getErrorMessage(
          error,
          "You may not be eligible, or someone else already claimed it.",
        ),
        variant: "destructive",
      });
    }
  }

  const eligible = statusQuery.data?.eligible ?? false;
  const nextRoleName = statusQuery.data?.next_role_name ?? null;

  let description: string;
  if (statusQuery.isLoading) {
    description = "Checking who can claim it...";
  } else if (statusQuery.isError) {
    // Distinct from "no eligible role was found" below — an error here means
    // eligibility genuinely could not be determined, not that it was checked
    // and came back empty. Conflating the two told an actually-eligible
    // officer to contact support over a transient network blip.
    description = "Couldn't check who can claim it. Retry in a moment.";
  } else if (eligible) {
    description = nextRoleName
      ? `As the highest-ranked remaining officer (${nextRoleName}), you can claim the presidency now.`
      : "You can claim the presidency now.";
  } else if (nextRoleName) {
    description = `Only a member holding the ${nextRoleName} role can claim it right now.`;
  } else {
    description =
      "No eligible officer role was found. Contact Frapp support to resolve this.";
  }

  return (
    <>
      {confirmDialog}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <RolesGlyph className="h-4 w-4 text-muted-foreground" />
            This chapter needs a new President
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {eligible ? (
          <CardFooter className="flex justify-end">
            <Button
              onClick={() => void handleClaim()}
              disabled={claimPresidency.isPending}
            >
              {claimPresidency.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Claim presidency
            </Button>
          </CardFooter>
        ) : null}
      </Card>
    </>
  );
}

/**
 * Transfer presidency, a row of Invites and presidency (#6029; a section of
 * its own until then): the current President's name, opening a searchable
 * list of members, since a plain list of 150 names can't be searched. Picking
 * someone asks to confirm, naming them. Only the current president can do this
 * (the API refuses anyone else), so it is shown only to a caller who holds
 * everything. It moves a person, not a permission, so it isn't on a role's
 * page.
 */
export function TransferPresidencyRow() {
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirmDialog();
  const membersQuery = useMembers();
  const viewerUserId = useViewerUserId();
  const viewerName = useViewerDisplayName();
  const transferPresidency = useTransferPresidency();
  const others = (membersQuery.data ?? [])
    .filter((member) => member.user_id !== viewerUserId && member.id)
    .sort((a, b) =>
      memberLabel(a.display_name, a.user_id).localeCompare(
        memberLabel(b.display_name, b.user_id),
      ),
    );

  async function handleTransfer(member: MemberProfile) {
    const name = memberLabel(member.display_name, member.user_id);
    const words = transferPresidencyConfirm(name);
    const confirmed = await confirm({
      title: words.title,
      description: words.body,
      confirmLabel: words.action,
      tone: "destructive",
    });
    if (!confirmed) return;
    try {
      await transferPresidency.mutateAsync({
        target_member_id: String(member.id),
      });
      toast({
        title: "Presidency transferred",
        description: `${name} is now President.`,
      });
    } catch (error) {
      toast({
        title: "Couldn't transfer presidency",
        description: getErrorMessage(
          error,
          "Only the current president can transfer it.",
        ),
        variant: "destructive",
      });
    }
  }

  return (
    <>
      {confirmDialog}
      <SettingsRow
        icon={Crown}
        label={PEOPLE_SETTINGS_COPY.transferPresidency}
        control={
          <SearchablePicker<MemberProfile>
            align="end"
            label="Pick the new President"
            placeholder="Find a member"
            items={others}
            nameOf={(member) =>
              memberLabel(member.display_name, member.user_id)
            }
            keyOf={(member) => String(member.id)}
            itemClassName="px-2 py-1.5 text-sm"
            renderItem={(member) =>
              memberLabel(member.display_name, member.user_id)
            }
            onPick={(member) => void handleTransfer(member)}
            status={
              membersQuery.isPending
                ? "Loading members…"
                : membersQuery.isError
                  ? "Couldn't load members"
                  : undefined
            }
            emptyText="Nobody else is in the chapter yet."
            trigger={
              <button
                type="button"
                disabled={transferPresidency.isPending}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition hover:bg-card-hover disabled:opacity-50",
                  FOCUS_RING,
                )}
              >
                {transferPresidency.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                {viewerName ?? "You"}
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            }
          />
        }
      />
    </>
  );
}
