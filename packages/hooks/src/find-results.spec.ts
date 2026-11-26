import { describe, expect, it } from "vitest";
import { buildFindResults } from "./find-results";

/**
 * What each row names and the cap a caller can set. The ranking, the hints
 * and the dialog's own caps are covered through web's wrapper
 * (`apps/web/components/layout/find-results.spec.ts`).
 */
const PAYLOAD = {
  members: [
    { user_id: "u1", display_name: "Ana Ruiz" },
    { user_id: "u2", display_name: "Ana Lee" },
    { user_id: "u3", display_name: "Ana Kim" },
  ],
  messages: [{ id: "m1", content: "ana is in", channel_id: "c1" }],
  events: [{ id: "e1", name: "Ana's send-off" }],
  backwork: [{ id: "b1", title: "Ana notes" }],
};
const CHANNELS = [{ id: "c1", name: "ana-fans" }];

describe("buildFindResults", () => {
  it("names the thing each row is, for the client to open its own way", () => {
    const targets = buildFindResults({
      query: "ana",
      filter: "All",
      channels: CHANNELS,
      payload: PAYLOAD,
    }).map((row) => row.target);
    expect(targets).toContainEqual({ type: "channel", channelId: "c1" });
    expect(targets).toContainEqual({ type: "member", userId: "u1" });
    expect(targets).toContainEqual({
      type: "message",
      channelId: "c1",
      messageId: "m1",
    });
    expect(targets).toContainEqual({ type: "event", eventId: "e1" });
    expect(targets).toContainEqual({ type: "backwork", entryId: "b1" });
  });

  // #6053: channels rank as Jump to a channel does, and a DM never matches.
  it("ranks a name that starts with the words first, and leaves DMs out", () => {
    const labels = buildFindResults({
      query: "rus",
      filter: "Channels",
      payload: undefined,
      channels: [
        { id: "a", name: "brush-up" },
        { id: "b", name: "rush-events", category: "Recruitment" },
        { id: "c", name: "dm-rus-1", type: "DM" },
        { id: "d", name: "rush", hidden: true },
      ],
    }).map((row) => [row.label, row.hint]);
    expect(labels).toEqual([
      ["rush-events", "Recruitment"],
      ["brush-up", undefined],
    ]);
  });
});
