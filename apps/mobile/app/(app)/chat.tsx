import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { firstParam } from "@/lib/route-params";
import {
  CHAT_LINK_CHANNEL_PARAM,
  CHAT_LINK_MESSAGE_PARAM,
} from "@repo/validation";

/**
 * A chat link (#3723): `app.frapp.live/chat?channel=…&message=…`, the
 * address Copy message link copies, or `?channel=…` alone, the web's channel
 * Copy link. This route hands it to the channel's thread, opened on the
 * message when it names one (`focusMessageId`, the way an Activity row opens
 * one), and draws nothing of its own. A link that names no channel goes to
 * Chat home, as a bare `/chat` on the web opens chat with nothing selected.
 *
 * It is reached by `frapp://chat?…` today. A web `/chat` link, tapped inside
 * a message or handed over by the system (`app/+native-intent.tsx`), opens
 * `/chat-thread` through the shared address table instead
 * (`lib/links/web-address-link.ts`, #6050); when the app claims the https
 * path is #6185.
 *
 * `replace`, not `push`, so going back from the thread doesn't stop on this
 * empty route.
 */
export default function ChatLinkRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    [CHAT_LINK_CHANNEL_PARAM]?: string | string[];
    [CHAT_LINK_MESSAGE_PARAM]?: string | string[];
  }>();
  const channelId = firstParam(params[CHAT_LINK_CHANNEL_PARAM]);
  const messageId = firstParam(params[CHAT_LINK_MESSAGE_PARAM]);

  useEffect(() => {
    if (channelId && messageId) {
      router.replace({
        pathname: "/chat-thread",
        params: { channelId, focusMessageId: messageId },
      });
    } else if (channelId) {
      router.replace({ pathname: "/chat-thread", params: { channelId } });
    } else {
      router.dismissTo("/");
    }
  }, [channelId, messageId, router]);

  return null;
}
