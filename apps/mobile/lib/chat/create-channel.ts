import type { ChannelFormValues } from "@/components/chat/channel-form-sheet";

/**
 * `POST /v1/channels`' body from the New channel sheet's answers, for both
 * places the phone opens it: Chat home's "+" (#3838) and Chapter settings →
 * New channel (#5296). One copy, so the two never send different channels.
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
