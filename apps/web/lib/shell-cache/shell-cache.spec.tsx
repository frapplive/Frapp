import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeShellCache,
  pruneOtherMembers,
  reopenShellCache,
} from "./shell-cache-clear";
import {
  clearShellCache,
  readShellRows,
  SHELL_CACHE_MAX_AGE_MS,
  SHELL_CACHE_MAX_ROW_CHARS,
  SHELL_CACHE_PREFIX,
  shellIdentityFrom,
  writeShellRow,
} from "./shell-cache";
import {
  keepShellAnswers,
  ShellCacheSync,
  useShellCached,
  useShellIdentity,
} from "./shell-cache-sync";

const A = { authUserId: "auth-a", chapterId: "chapter-1" };
const ROSTER = [{ user_id: "u-1", display_name: "Winston", avatar_url: null }];

function ownKeys(): string[] {
  return Object.keys(localStorage).filter((k) =>
    k.startsWith(SHELL_CACHE_PREFIX),
  );
}

beforeEach(() => {
  localStorage.clear();
  reopenShellCache();
});
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

describe("keeping and offering (#5049)", () => {
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
    await client.fetchQuery({
      queryKey: ["chapters", "current", "chapter-1"],
      queryFn: () => ({
        name: "Beta Theta Omega",
        logo_url: null,
        subscription_status: "past_due",
        past_due_since: "2026-11-01",
      }),
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
    expect([...rows.keys()].sort()).toEqual(["chapter", "me", "roster"]);
    expect(rows.get("me")?.data).toEqual({
      display_name: "Paul",
      avatar_url: null,
    });
    // The chapter head only: no billing state on disk.
    expect(rows.get("chapter")?.data).toEqual({
      name: "Beta Theta Omega",
      logo_url: null,
      branding: null,
    });
  });

  it("drops an answer from a query no longer in the cache", async () => {
    const client = new QueryClient();
    const stop = keepShellAnswers(client, A);
    const cache = client.getQueryCache();
    const query = cache.build(client, {
      queryKey: ["members", "chapter-1", "roster"],
      queryFn: () => Promise.resolve(ROSTER),
    });
    // An identity change cleared the cache; the read still answers.
    cache.remove(query);
    await query.fetch();
    stop();
    expect(readShellRows(A).size).toBe(0);
  });

  it("writes nothing once sign-out has closed the store, until a scope starts", () => {
    closeShellCache();
    writeShellRow(A, "roster", ROSTER);
    expect(ownKeys()).toEqual([]);
    reopenShellCache();
    writeShellRow(A, "roster", ROSTER);
    expect(ownKeys()).toHaveLength(1);
  });

  it("deletes every other member's rows once the member is known", () => {
    writeShellRow(A, "roster", ROSTER);
    writeShellRow({ ...A, chapterId: "chapter-2" }, "roster", ROSTER);
    writeShellRow(
      { authUserId: "auth-b", chapterId: "chapter-9" },
      "roster",
      ROSTER,
    );
    pruneOtherMembers("auth-a");
    expect(ownKeys().sort()).toEqual([
      `${SHELL_CACHE_PREFIX}auth-a|chapter-1|roster`,
      `${SHELL_CACHE_PREFIX}auth-a|chapter-2|roster`,
    ]);
  });

  it("offers this scope's rows, never the query cache, and disowns them when the scope moves", async () => {
    writeShellRow(A, "me", { display_name: "Paul", avatar_url: null });
    writeShellRow(A, "events", [{ id: "e-1" }]);
    const client = new QueryClient();
    function Probe() {
      const me = useShellIdentity();
      const events = useShellCached<unknown[]>("events");
      return (
        <span data-testid="probe">
          {me?.display_name ?? "none"}|{events?.length ?? 0}
        </span>
      );
    }
    const tree = (authUserId: string | null) => (
      <QueryClientProvider client={client}>
        <ShellCacheSync authUserId={authUserId} chapterId="chapter-1">
          <Probe />
        </ShellCacheSync>
      </QueryClientProvider>
    );
    const { rerender } = render(tree("auth-a"));
    await waitFor(() =>
      expect(screen.getByTestId("probe").textContent).toBe("Paul|1"),
    );
    expect(client.getQueryData(["events", "chapter-1"])).toBeUndefined();
    expect(client.getQueryData(["user", "me"])).toBeUndefined();

    // Another account in this tab: the first render under it shows none of A's.
    rerender(tree("auth-b"));
    expect(screen.getByTestId("probe").textContent).toBe("none|0");
  });
});
