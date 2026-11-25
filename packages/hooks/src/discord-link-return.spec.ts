import { describe, expect, it } from "vitest";
import {
  discordLinkedMessage,
  discordUnlinkedMessage,
  readDiscordLinkReturn,
} from "./use-discord-author-link";

const read = (query: string) =>
  readDiscordLinkReturn(new URLSearchParams(query));

describe("readDiscordLinkReturn (#5414)", () => {
  it("reads a parked link's token to confirm", () => {
    expect(read("discord=pending&handshake=abc")).toEqual({
      kind: "confirm",
      handshake: "abc",
    });
    expect(read("discord=pending")).toEqual({ kind: "failed" });
  });

  it("reads each refusal by its code, never by text on the address", () => {
    for (const kind of ["declined", "expired", "invalid", "failed"]) {
      expect(read(`discord=${kind}&error_description=Click%20here`)).toEqual({
        kind,
      });
    }
  });

  it("ignores an address with no code, or one the API never sends", () => {
    expect(read("section=apps")).toBeNull();
    expect(read("discord=constructor")).toBeNull();
  });
});

describe("Discord link copy", () => {
  it("counts what moved", () => {
    expect(discordLinkedMessage(0)).toMatch(/when your chapter imports them/);
    expect(discordLinkedMessage(2)).toBe(
      "Discord account linked. 2 imported messages now show as yours.",
    );
    expect(discordUnlinkedMessage(0)).toBe("Discord account unlinked.");
  });
});
