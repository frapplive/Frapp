import { describe, expect, it } from "vitest";
import {
  APP_LINK_PATHS,
  CHAT_LINK_PATH,
  messageLinkUrl,
  phoneAddressFor,
  PRODUCTION_APP_ORIGIN,
} from "./index";

const TARGET = {
  channelId: "11111111-1111-4111-8111-111111111111",
  messageId: "22222222-2222-4222-8222-222222222222",
};

describe("message links (#3723)", () => {
  it("are a /chat link carrying the channel and the message", () => {
    expect(messageLinkUrl("https://app.frapp.live/", TARGET)).toBe(
      `https://app.frapp.live/chat?channel=${TARGET.channelId}&message=${TARGET.messageId}`,
    );
  });

  // The phone reads them through the shared address table (#6050).
  const phoneScreen = (href: string) => {
    const url = new URL(href);
    return phoneAddressFor(url.pathname, url.searchParams);
  };

  it("open the message's channel on the message on the phone", () => {
    expect(phoneScreen(messageLinkUrl(PRODUCTION_APP_ORIGIN, TARGET))).toEqual({
      pathname: "/chat-thread",
      params: { channelId: TARGET.channelId, focusMessageId: TARGET.messageId },
    });
  });

  it("name a channel alone too, as the web's channel Copy link does", () => {
    expect(
      phoneScreen(`https://app.frapp.live/chat?channel=${TARGET.channelId}`),
    ).toEqual({
      pathname: "/chat-thread",
      params: { channelId: TARGET.channelId },
    });
  });

  it("are not a path the app claims yet (#6185)", () => {
    expect(APP_LINK_PATHS as readonly string[]).not.toContain(CHAT_LINK_PATH);
  });
});
