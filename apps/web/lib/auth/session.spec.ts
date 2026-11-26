import { beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ auth: { signOut } }),
}));
vi.mock("@/lib/observability/reset", () => ({
  resetObservabilityOnLogout: vi.fn(),
}));

describe("signingOutHere (#4440)", () => {
  beforeEach(() => {
    vi.resetModules();
    signOut.mockReset().mockResolvedValue({ error: null });
  });

  it("is false until this tab signs out, then true for the window", async () => {
    const { signOutCurrentSession, signingOutHere } = await import("./session");
    expect(signingOutHere()).toBe(false);

    // Latched before the server-side revoke, while the call is in flight.
    let seenDuring: boolean | null = null;
    signOut.mockImplementation(async () => {
      seenDuring = signingOutHere();
      return { error: null };
    });
    const start = Date.now();
    await signOutCurrentSession();
    expect(seenDuring).toBe(true);
    expect(signingOutHere(start + 29_000)).toBe(true);
    expect(signingOutHere(start + 31_000)).toBe(false);
  });
});

describe("sign-out and the shell cache (#5049)", () => {
  beforeEach(() => {
    vi.resetModules();
    signOut.mockReset().mockResolvedValue({ error: null });
    localStorage.clear();
  });

  it("clears every row before signing out, and keeps none written during it", async () => {
    const { signOutCurrentSession } = await import("./session");
    const { writeShellRow } = await import("@/lib/shell-cache/shell-cache");
    const scope = { authUserId: "auth-a", chapterId: "chapter-1" };
    writeShellRow(scope, "roster", [{ user_id: "u-1" }]);
    signOut.mockImplementation(async () => {
      // A read that answers during the sign-out round trip.
      writeShellRow(scope, "roster", [{ user_id: "u-1" }]);
      return { error: null };
    });
    await signOutCurrentSession();
    expect(
      Object.keys(localStorage).filter((k) => k.startsWith("frapp.shell.v1|")),
    ).toEqual([]);
  });
});
