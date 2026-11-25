/**
 * The member profile's `⋯` menu (s13): what a viewer reaches for only
 * now and then, kept off the profile's face (Paul, 2026-11-11: nobody opens a
 * profile to remove someone, and web drew Remove member as a big red button
 * on his own profile). Edit name and graduation year where the API says this
 * viewer may fix them (`viewer_can_edit_profile`, #4367), Block or Unblock
 * for another member, and Remove from chapter where the API says this viewer
 * may (`viewer_can_remove`), and Time out or Lift timeout where it says
 * `viewer_can_timeout` (#6006). Never on your own profile: the sheet offers none
 * of them there, so the `⋯` isn't drawn.
 */
import { Alert } from "react-native";
import { blockActionLabel } from "@repo/chat-core/block-copy";
import { CHAT_TIMEOUT_COPY } from "@repo/chat-core/chat-timeout";
import { CORRECTION_MENU_LABEL } from "@repo/validation";
import {
  REMOVE_CONFIRM_BODY,
  REMOVE_FROM_CHAPTER_LABEL,
  removeConfirmTitle,
} from "@repo/hooks/member-removal-copy";
import { openItemMenu } from "@/components/item-actions-menu";
import type { FocusReturn } from "@/lib/overlay";

export type MemberMenuAction =
  | "edit"
  | "time-out"
  | "lift-timeout"
  | "block"
  | "unblock"
  | "remove";

/** The menu's rows, in order, or none when the `⋯` has nothing to hold. */
export function memberMenuActions({
  canEdit = false,
  canTimeOut = false,
  timedOut = false,
  canBlock,
  isBlocked,
  canRemove,
}: {
  /** The API's `viewer_can_edit_profile`, already false on the viewer's own profile. */
  canEdit?: boolean;
  /** The API's `viewer_can_timeout` (#6006), already false on the viewer's own profile. */
  canTimeOut?: boolean;
  /** A timeout is running, so the row lifts it instead (#6006). */
  timedOut?: boolean;
  /** Another real member, not the viewer or the system actor. */
  canBlock: boolean;
  isBlocked: boolean;
  /** The API's `viewer_can_remove`, already false on the viewer's own profile. */
  canRemove: boolean;
}): MemberMenuAction[] {
  const actions: MemberMenuAction[] = [];
  if (canEdit) actions.push("edit");
  // Moderation, before Block and the removal it stops short of (as on web).
  if (canTimeOut) actions.push(timedOut ? "lift-timeout" : "time-out");
  if (canBlock) actions.push(isBlocked ? "unblock" : "block");
  if (canRemove) actions.push("remove");
  return actions;
}

/** A row's label: `Block <name>` is `block-copy`'s on every surface. */
function memberMenuLabel(action: MemberMenuAction, name: string): string {
  switch (action) {
    case "edit":
      return CORRECTION_MENU_LABEL;
    case "time-out":
      return CHAT_TIMEOUT_COPY.action;
    case "lift-timeout":
      return CHAT_TIMEOUT_COPY.lift;
    case "block":
      return blockActionLabel(name);
    case "unblock":
      return `Unblock ${name}`;
    case "remove":
      return REMOVE_FROM_CHAPTER_LABEL;
  }
}

const DESTRUCTIVE: ReadonlySet<MemberMenuAction> = new Set(["block", "remove"]);

/**
 * Opens the menu: the glass menu (`openItemMenu`), closed by a tap outside
 * or back.
 */
export function showMemberMenu(
  name: string,
  actions: readonly MemberMenuAction[],
  onPick: (action: MemberMenuAction) => void,
  /** The ⋯'s press, so the menu opens under it. */
  at?: { pageY?: number; trigger?: FocusReturn | null },
): void {
  if (actions.length === 0) return;
  openItemMenu(
    {
      title: name,
      actions: actions.map((action) => ({
        key: action,
        label: memberMenuLabel(action, name),
        destructive: DESTRUCTIVE.has(action),
        run: () => onPick(action),
      })),
    },
    at,
  );
}

/**
 * Asks before removing, as web's confirm dialog does: Cancel, then the
 * destructive verb naming its object.
 */
export function confirmRemoveMember({
  name,
  run,
}: {
  name: string;
  run: () => void;
}): void {
  Alert.alert(removeConfirmTitle(name), REMOVE_CONFIRM_BODY, [
    { text: "Cancel", style: "cancel" },
    { text: REMOVE_FROM_CHAPTER_LABEL, style: "destructive", onPress: run },
  ]);
}

/**
 * Asks before lifting a timeout early (#6006), as web's confirm dialog does:
 * Cancel, then the verb.
 */
export function confirmLiftTimeout({
  name,
  run,
}: {
  name: string;
  run: () => void;
}): void {
  Alert.alert(
    CHAT_TIMEOUT_COPY.liftConfirmTitle(name),
    CHAT_TIMEOUT_COPY.liftConfirmBody,
    [
      { text: "Cancel", style: "cancel" },
      { text: CHAT_TIMEOUT_COPY.lift, onPress: run },
    ],
  );
}
