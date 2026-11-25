export const NOTIFICATION_PROVIDER = 'NOTIFICATION_PROVIDER';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
  priority?: 'URGENT' | 'NORMAL' | 'SILENT';
  /**
   * Notification category (`chat`, `events`, `announcements`, …). Carried for
   * delivery telemetry only — the push transport does not send it to the
   * device; the client groups on `data.target` instead. Lets `push_delivery`
   * records be sliced by category (`spec/behavior/observability.md`).
   */
  category?: string;
  /**
   * What the phone stacks this push with. iOS groups every push sharing a
   * `threadId` into one stack in Notification Center (`aps.thread-id`); Android
   * ignores it. Chat pushes set it per channel, so a DM stacks per person and a
   * channel per channel (`spec/behavior/notifications.md` § Grouping and
   * clearing). Absent, iOS stacks the push with the app's others.
   */
  threadId?: string;
  /**
   * The action buttons the phone shows on this push: an Expo `categoryId`
   * the app registered at startup (`@repo/validation`
   * `push-action-categories.ts`), such as the excuse push's Approve and
   * Decline (#4686). A build that never registered it shows the push without
   * buttons.
   */
  categoryId?: string;
  /**
   * The person a chat push comes from, so the phone draws it as a message
   * from them with their photo, the way iMessage and WhatsApp do (#6024).
   * Set only on chat pushes with a named sender. iOS draws it through the
   * app's Notification Service Extension
   * (`apps/mobile/targets/notification-service`), which reads this from
   * `data.communication`; a build without the extension shows the push as
   * before. Android shows the push as before until #6035.
   */
  communication?: PushCommunication;
}

/** Who a chat push is from, and the conversation it belongs to. */
export interface PushCommunication {
  senderId: string;
  senderName: string;
  /**
   * A signed, short-lived URL to the sender's profile photo, or absent when
   * they have none (the phone then draws their initials).
   */
  senderImageUrl?: string;
  /**
   * The conversation's name when it has more than two people (`#general`, a
   * named group DM). Absent for a DM, which the phone draws as one-to-one.
   */
  groupName?: string;
}

export interface SendToUserResult {
  /**
   * Tokens Expo reported as permanently undeliverable (`DeviceNotRegistered`)
   * — safe to prune from `push_tokens`. Never populated for a transient or
   * app-level failure (rate limits, oversized payload, bad credentials): those
   * say nothing about whether the specific token is still valid.
   */
  invalidTokens: string[];
}

export interface INotificationProvider {
  sendToUser(
    pushTokens: string[],
    payload: PushPayload,
  ): Promise<SendToUserResult>;
}
