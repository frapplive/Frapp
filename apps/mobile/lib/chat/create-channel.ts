import { canAll } from "@repo/validation";
import type { ChannelFormValues } from "@/components/chat/channel-form-sheet";

/**
 * What making a channel takes: `POST /v1/channels` requires
 * `channels:create`, and the New channel sheet's who-can-see and who-can-post
 * lists read `GET /v1/channels/access-options`, which requires
 * `channels:manage`. Both of the phone's doors (Chat home's "+", #3838, and
 * Chapter settings → New channel, #5296) ask this, so neither offers a form
 * that fails on save (#5296: Chat home asked for `channels:manage` alone).
 */
export const CREATE_CHANNEL_PERMISSIONS = [
  "channels:create",
  "channels:manage",
] as const;

export function canCreateChannel(permissions: readonly string[]): boolean {
  return canAll(CREATE_CHANNEL_PERMISSIONS, permissions);
}

/**
 * `POST /v1/channels`' body from the New channel sheet's answers, for both
 * doors, so the two never send different channels.
 */
export function createChannelBody(values: ChannelFormValues) {
  return {
    name: values.name,
    description: values.description || undefined,
    type: values.isPrivate ? ("PRIVATE" as const) : ("PUBLIC" as const),
    category_id: values.categoryId ?? undefined,
    ...values.access,
  };
}

/** What the sheet says when the server refuses a new channel. */
export const CREATE_CHANNEL_FAILED =
  "Couldn't create the channel. Check your connection and try again.";

/** The sheet's `accessOptionsState` from the access-options read. */
export function accessOptionsStateOf(query: {
  isSuccess: boolean;
  isError: boolean;
}): "ready" | "loading" | "error" {
  return query.isSuccess ? "ready" : query.isError ? "error" : "loading";
}
