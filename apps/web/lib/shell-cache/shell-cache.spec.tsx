import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearShellCache,
  readShellRows,
  SHELL_CACHE_MAX_AGE_MS,
  SHELL_CACHE_MAX_ROW_CHARS,
  SHELL_CACHE_PREFIX,
  shellIdentityFrom,
  writeShellRow,
} from "./shell-cache";
import { keepShellAnswers, seedShellCache } from "./shell-cache-sync";

const A = { authUserId: "auth-a", chapterId: "chapter-1" };
const ROSTER = [{ user_id: "u-1", display_name: "Winston", avatar_url: null }];

function ownKeys(): string[] {
  return Object.keys(localStorage).filter((k) =>
    k.startsWith(SHELL_CACHE_PREFIX),
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("shell cache rows", () => {
  it("reads back only the scope a row was written under", () => {
    writeShellRow(A, "roster", ROSTER);
    expect(readShellRows(A).get("roster")?.data).toEqual(ROSTER);
    expect(
      readShellRows({ authUserId: "auth-b", chapterId: "chapter-1" }).size,
    ).toBe(0);
  });

  it("deletes another member's and another chapter's rows on a read", () => {
    writeShellRow(A, "roster", ROSTER);
    writeShellRow({ ...A, chapterId: "chapter-2" }, "roster", ROSTER);
    writeShellRow({ ...A, authUserId: "auth-b" }, "roster", ROSTER);
    readShellRows(A);
    expect(ownKeys()).toEqual([`${SHELL_CACHE_PREFIX}auth-a|chapter-1|roster`]);
  });

  it("drops a row older than seven days, or one dated in the future", () => {
    const now = Date.now();
    writeShellRow(A, "roster", ROSTER, now - SHELL_CACHE_MAX_AGE_MS - 1);
    writeShellRow(A, "events", [], now + 10 * 60_000);
    expect(readShellRows(A, now).size).toBe(0);
    expect(ownKeys()).toEqual([]);
  });

  it("keeps no row over the size cap", () => {
    writeShellRow(A, "events", "x".repeat(SHELL_CACHE_MAX_ROW_CHARS));
    expect(ownKeys()).toEqual([]);
  });

  it("drops a row it can't parse", () => {
    localStorage.setItem(`${SHELL_CACHE_PREFIX}auth-a|chapter-1|roster`, "{");
    expect(readShellRows(A).size).toBe(0);
    expect(ownKeys()).toEqual([]);
  });

  it("clears every row and leaves other storage alone", () => {
    writeShellRow(A, "roster", ROSTER);
    writeShellRow({ ...A, authUserId: "auth-b" }, "roster", ROSTER);
    localStorage.setItem("frapp.nav.collapsed", "1");
    clearShellCache();
    expect(ownKeys()).toEqual([]);
    expect(localStorage.getItem("frapp.nav.collapsed")).toBe("1");
  });

  it("keeps only the name and photo of the member's own record", () => {
    expect(
      shellIdentityFrom({
        id: "u-me",
        display_name: " Paul Carlson ",
        avatar_url: "https://x/a.png",
        email: "p@example.test",
        phone: "+15555550100",
      }),
    ).toEqual({ display_name: "Paul Carlson", avatar_url: "https://x/a.png" });
    expect(shellIdentityFrom({ display_name: " ", avatar_url: null })).toBe(
      null,
    );
  });
});

describe("seeding and keeping (#5049)", () => {
  it("paints the last answers where a query has none, marked stale", () => {
    const now = Date.now();
    writeShellRow(A, "roster", ROSTER, now - 1000);
    writeShellRow(A, "permissions", { permissions: ["members:view"] }, now);
    const client = new QueryClient();

    seedShellCache(client, A, now);

    const roster = client.getQueryState(["members", "chapter-1", "roster"]);
    expect(roster?.data).toEqual(ROSTER);
    expect(roster?.dataUpdatedAt).toBe(now - 1000);
    expect(roster?.isInvalidated).toBe(true);
    expect(
      client.getQueryData(["user", "me", "permissions", "chapter-1"]),
    ).toEqual({ permissions: ["members:view"] });
  });

  it("never covers a live answer or a failed read", () => {
    writeShellRow(A, "roster", ROSTER);
    writeShellRow(A, "events", [{ id: "old" }]);
    const client = new QueryClient();
    client.setQueryData(["members", "chapter-1", "roster"], []);
    void client
      .fetchQuery({
        queryKey: ["events", "chapter-1"],
        queryFn: () => Promise.reject(new Error("down")),
        retry: false,
      })
      .catch(() => {});
    return new Promise<void>((resolve) => setTimeout(resolve, 0)).then(() => {
      seedShellCache(client, A);
      expect(client.getQueryData(["members", "chapter-1", "roster"])).toEqual(
        [],
      );
      expect(client.getQueryData(["events", "chapter-1"])).toBeUndefined();
    });
  });

  it("returns the cached name and photo, and never seeds the user record", () => {
    writeShellRow(A, "me", { display_name: "Paul", avatar_url: null });
    const client = new QueryClient();
    expect(seedShellCache(client, A)).toEqual({
      display_name: "Paul",
      avatar_url: null,
    });
    expect(client.getQueryData(["user", "me"])).toBeUndefined();
  });

  it("keeps a fetched answer for this chapter, and never a manual write", async () => {
    const client = new QueryClient();
    const stop = keepShellAnswers(client, A);

    await client.fetchQuery({
      queryKey: ["members", "chapter-1", "roster"],
      queryFn: () => ROSTER,
    });
    await client.fetchQuery({
      queryKey: ["user", "me"],
      queryFn: () => ({ display_name: "Paul", email: "p@example.test" }),
    });
    // Another chapter's key, an optimistic write, and a key not kept.
    await client.fetchQuery({
      queryKey: ["members", "chapter-2", "roster"],
      queryFn: () => ROSTER,
    });
    client.setQueryData(["events", "chapter-1"], [{ id: "optimistic" }]);
    await client.fetchQuery({ queryKey: ["settings"], queryFn: () => ({}) });
    stop();

    const rows = readShellRows(A);
    expect([...rows.keys()].sort()).toEqual(["me", "roster"]);
    expect(rows.get("me")?.data).toEqual({
      display_name: "Paul",
      avatar_url: null,
    });
  });

  it("drops an answer that lands after the cache was cleared", async () => {
    const client = new QueryClient();
    const stop = keepShellAnswers(client, A);
    let answer: (value: unknown) => void = () => {};
    const pending = client.fetchQuery({
      queryKey: ["members", "chapter-1", "roster"],
      queryFn: () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    });
    // An identity change clears the query cache before the read answers.
    client.clear();
    answer(ROSTER);
    await pending.catch(() => {});
    stop();
    expect(readShellRows(A).size).toBe(0);
  });
});
