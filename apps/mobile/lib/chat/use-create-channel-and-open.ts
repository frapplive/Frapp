import { useCallback } from "react";
import { useRouter } from "expo-router";
import { useCreateChannel } from "@repo/hooks";
import { errorCopy } from "@repo/hooks/error-copy";
import type { ChannelFormValues } from "@/components/chat/channel-form-sheet";
import { CREATE_CHANNEL_FAILED, createChannelBody } from "./create-channel";

/**
 * The New channel sheet's save, for both of the phone's doors (Chat home's
 * "+" and Chapter settings → New channel, #5296): creates the channel, then
 * opens it, as Discord and Slack do, so the first message is one tap away. A
 * refusal rejects with the line the sheet shows (`errorCopy`).
 */
export function useCreateChannelAndOpen() {
  const router = useRouter();
  const createChannel = useCreateChannel();
  return useCallback(
    async (values: ChannelFormValues) => {
      let created: { id?: unknown } | undefined;
      try {
        created = (await createChannel.mutateAsync(
          createChannelBody(values),
        )) as { id?: unknown } | undefined;
      } catch (error) {
        throw new Error(errorCopy(error, CREATE_CHANNEL_FAILED));
      }
      if (typeof created?.id === "string") {
        router.push({
          pathname: "/chat-thread",
          params: { channelId: created.id },
        });
      }
    },
    [createChannel, router],
  );
}
