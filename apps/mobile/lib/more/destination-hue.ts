import { NOTIFICATION_TILE_HUE } from "@repo/hooks/notification-rows";
import { roleColor, type RoleColorHex } from "@repo/validation";

/**
 * The fixed hue each place on the You tab wears on its lead tile (Paul,
 * 2026-11-12, #4610 step 3; `spec/ui/design-system/foundations.md` §6, "A
 * place's hue").
 *
 * The You tab is a list of up to ten places a member opens by habit. A hue
 * per place lets them find Study hours or Resources without reading the
 * labels, as iOS Settings and Telegram's settings list do. The rule that
 * keeps it from becoming decoration: **a hue names a place, never a state.**
 * It is the same every day for every member, so it carries no news. Rows
 * that show a state (the Activity list, Chat home's Up next) keep a neutral
 * tile, because colour there already means something: the accent asks the
 * member to act and red is overdue.
 *
 * **A place keeps its hue wherever a tile draws it.** The Notifications rows
 * already tile a notice in its kind's hue (`NOTIFICATION_TILE_HUE`), so the
 * places both screens show read their hue from that map: a service notice
 * and the Service hours row are both teal, a dues notice and the Dues row
 * sand, an event notice and Host check-in sky. The role palette has ten
 * hues and the app has more places than that, so a hue can stand for a
 * different place on another screen (green is a task there and Switch
 * chapter here), but never for two places on one screen.
 *
 * The hues are the role palette's (`ROLE_COLOR_PALETTE`), which leaves out
 * gold and red on purpose, so no tile can read as the accent or as a
 * mention. `LeadTile` paints a hue the way the Notifications tile and an
 * initials avatar do (`memberAvatarTint`: the hue at 14% over the card under
 * the glyph at full strength), and `member-avatar-color.spec.ts` holds that
 * pair at AA for every hue in the palette.
 *
 * Settings is slate. Chapter settings shared it, the same kind of place,
 * until it left You for Chat home's chapter menu (2026-11-19).
 *
 * The recruitment row (#5924) is the eleventh place and the palette has ten,
 * so it shares green with Create a chapter, the one pair that never meets:
 * Create a chapter is drawn only for someone with no chapter, and the
 * recruitment row only inside one ({@link SHARED_HUE_PAIRS}).
 */
export type YouDestination =
  | "study"
  | "service"
  | "dues"
  | "resources"
  | "directory"
  | "settings"
  | "chapter"
  | "invite"
  | "hostCheckIn"
  | "recruitment";

export const YOU_DESTINATION_HUE: Record<YouDestination, RoleColorHex> = {
  study: roleColor("periwinkle"),
  service: NOTIFICATION_TILE_HUE.service,
  dues: NOTIFICATION_TILE_HUE.billing,
  // Documents' violet: the row opens Documents, where minutes are filed
  // since #5949 (Minutes had rose while it was its own row).
  resources: roleColor("violet"),
  directory: roleColor("orange"),
  settings: roleColor("slate"),
  chapter: roleColor("green"),
  invite: roleColor("lime"),
  hostCheckIn: NOTIFICATION_TILE_HUE.events,
  recruitment: roleColor("green"),
};

/**
 * Places that share a hue because You never draws both at once (see above).
 * Only this list may repeat a hue; `destination-hue.spec.ts` holds the rest
 * apart.
 */
export const SHARED_HUE_PAIRS: readonly (readonly [
  YouDestination,
  YouDestination,
])[] = [["chapter", "recruitment"]];

/** The hex a place's tile and glyph draw in. */
export function destinationHue(place: YouDestination): RoleColorHex {
  return YOU_DESTINATION_HUE[place];
}
