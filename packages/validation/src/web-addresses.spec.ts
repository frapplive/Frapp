import { describe, expect, it } from "vitest";
import {
  ONE_SHOT_ADDRESS_PARAMS,
  WEB_ADDRESSES,
  WEB_ADDRESS_PARAMS,
  phoneAddressFor,
  webAddressRow,
} from "./web-addresses";
import {
  CHAT_LINK_CHANNEL_PARAM,
  CHAT_LINK_MESSAGE_PARAM,
} from "./message-link";

describe("web addresses", () => {
  it("keeps chat's link names", () => {
    expect(WEB_ADDRESS_PARAMS.chat.channel).toBe(CHAT_LINK_CHANNEL_PARAM);
    expect(WEB_ADDRESS_PARAMS.chat.message).toBe(CHAT_LINK_MESSAGE_PARAM);
    expect(ONE_SHOT_ADDRESS_PARAMS.message).toBe(CHAT_LINK_MESSAGE_PARAM);
  });

  it("lists each path once", () => {
    const paths = WEB_ADDRESSES.map((row) => row.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("names only parameters the page owns", () => {
    for (const row of WEB_ADDRESSES) {
      for (const target of row.phone ?? []) {
        for (const name of [
          ...(target.when ?? []),
          ...Object.keys(target.params ?? {}),
        ]) {
          expect(row.params, `${row.path} ${name}`).toContain(name);
        }
      }
    }
  });

  it("every phone list ends on a screen that needs no parameter", () => {
    for (const row of WEB_ADDRESSES) {
      if (!row.phone) continue;
      expect(row.phone.at(-1)?.when ?? [], row.path).toEqual([]);
    }
  });

  it("maps a thread link to the thread screen", () => {
    expect(phoneAddressFor("/chat", "?channel=c1&thread=m1")).toEqual({
      pathname: "/chat-thread",
      params: { channelId: "c1", threadRootId: "m1" },
    });
  });

  it("keeps the message on a thread link", () => {
    expect(
      phoneAddressFor("/chat", "?channel=c1&thread=t1&message=m1"),
    ).toEqual({
      pathname: "/chat-thread",
      params: { channelId: "c1", threadRootId: "t1", focusMessageId: "m1" },
    });
  });

  it("maps a message link to the channel at that message", () => {
    expect(phoneAddressFor("/chat", "?channel=c1&message=m2")).toEqual({
      pathname: "/chat-thread",
      params: { channelId: "c1", focusMessageId: "m2" },
    });
  });

  it("maps an event, a day and the calendar", () => {
    expect(phoneAddressFor("/events", "?day=2026-11-30&event=e1")).toEqual({
      pathname: "/event-details",
      params: { id: "e1" },
    });
    expect(phoneAddressFor("/events", "?event=e1&excuse=1")).toEqual({
      pathname: "/event-details",
      params: { id: "e1", excuse: "1" },
    });
    expect(phoneAddressFor("/events", "?day=2026-11-30")).toEqual({
      pathname: "/calendar-day",
      params: { day: "2026-11-30" },
    });
    expect(phoneAddressFor("/events", "")).toEqual({
      pathname: "/events",
      params: {},
    });
  });

  it("maps a member and a prospect", () => {
    expect(phoneAddressFor("/members", "?tab=all&member=u1")).toEqual({
      pathname: "/member",
      params: { userId: "u1" },
    });
    expect(
      phoneAddressFor("/rush", new URLSearchParams({ prospect: "p1" })),
    ).toEqual({ pathname: "/rush-prospect", params: { candidateId: "p1" } });
  });

  it("leaves web-only pages and unknown paths in the browser", () => {
    expect(phoneAddressFor("/settings", "?tab=chat")).toBeNull();
    expect(phoneAddressFor("/backwork", "")).toBeNull();
    expect(phoneAddressFor("/meetings/abc/notes", "")).toBeNull();
    expect(phoneAddressFor("/nowhere", "")).toBeNull();
  });

  it("matches a dynamic segment", () => {
    expect(webAddressRow("/meetings/abc")?.path).toBe("/meetings/[id]");
    expect(webAddressRow("/meetings/abc/notes/")?.path).toBe(
      "/meetings/[id]/notes",
    );
    expect(webAddressRow("/meetings")).toBeNull();
  });
});
