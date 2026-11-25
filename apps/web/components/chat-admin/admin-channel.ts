import type { ChatNotificationLevel } from "@repo/validation";

/**
 * The channel and category rows Chat's settings read (`GET /v1/channels`,
 * `GET /v1/channels/categories`), shared by the Chat page's channel tree
 * (`chat-admin-page.tsx`) and one channel's page (`channel-settings-page.tsx`).
 */

export type ChannelType =
  "PUBLIC" | "PRIVATE" | "ROLE_GATED" | "DM" | "GROUP_DM";

export interface AdminChannel {
  id: string;
  name: string;
  description: string | null;
  type: ChannelType;
  category_id: string | null;
  /**
   * Who can see and who can post (#3722): `null` is everyone (who can post:
   * everyone who can see it), a list names tiers and roles. Null on a
   * private channel, whose members decide.
   */
  who_can_see?: string[] | null;
  who_can_post?: string[] | null;
  /** Mirrors `who_can_post !== null`; still what the built-in push default reads. */
  is_read_only: boolean;
  /** Officer-set default push level (#2771); `null` = the built-in default. */
  default_notification_level: ChatNotificationLevel | null;
  /** The chapter's default channel, where Chat opens with no last channel. */
  is_default?: boolean;
  /** Leave out of Activity (#3897): its sign-up links reach no one's Activity. */
  activity_excluded?: boolean;
  /**
   * The chapter's audit log, `#chapter-audit` (#3909). Only Frapp posts in
   * it, so the server refuses a rename, deleting it, or switching read-only
   * off, and its page locks all three.
   */
  is_audit_log?: boolean;
  /**
   * The chapter's order inside its category (#4178), set by dragging in the
   * chat rail. The category tree sorts by it the way the rail does.
   */
  display_order?: number | null;
}

export interface AdminCategory {
  id: string;
  name: string;
  display_order: number;
  /** What a new channel in it copies, and what a matching channel follows (#3722). */
  who_can_see?: string[] | null;
  who_can_post?: string[] | null;
}

/**
 * Which channels Chat settings lists, and which ask who can see and post:
 * one rule for both apps, in `@repo/hooks/channel-access`.
 */
export {
  isSettingsChannel as isAdminChannel,
  takesChannelAccessLists as takesAccessLists,
} from "@repo/hooks/channel-access";
