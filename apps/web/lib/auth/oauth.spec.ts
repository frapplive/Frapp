import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describeOAuthKickoffError,
  IDENTITY_COLLISION_COPY,
  OAUTH_UNAVAILABLE_COPY,
  startWebOAuth,
} from "./oauth";

describe("describeOAuthKickoffError", () => {
  it("guides a colliding email back to password or magic link", () => {
    expect(
      describeOAuthKickoffError({ code: "identity_already_exists" }),
    ).toBe(IDENTITY_COLLISION_COPY);
  });

  it("does not pretend an unconfigured provider is the member's fault", () => {
    expect(
      describeOAuthKickoffError({
        message: "Unsupported provider: provider is not enabled",
      }),
    ).toBe(OAUTH_UNAVAILABLE_COPY);
  });

  it("never shows the provider's own sentence", () => {
    expect(describeOAuthKickoffError({ message: "Access denied" })).toBe(
      "Unable to start sign-in. Retry in a moment.",
    );
  });
});

describe("startWebOAuth inside the desktop app", () => {
  const AUTHORIZE = "https://abcdefgh.supabase.co/auth/v1/authorize?provider=google";
  type Start = { options?: { redirectTo?: string; skipBrowserRedirect?: boolean; queryParams?: unknown } };
  const started = () => vi.fn(async (start: Start) => ({ data: { url: start && AUTHORIZE }, error: null }));
  const returnsTo = (start: Start) => new URL(start.options?.redirectTo ?? "");

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the window where it is and opens the provider page in the browser", async () => {
    const signInWithOAuth = started();
    const openExternal = vi.fn(async () => true);

    const result = await startWebOAuth(
      { auth: { signInWithOAuth } },
      "google",
      "https://app.frapp.live",
      "/join?token=inv-1",
      "sign-in",
      { openExternal },
    );

    expect(result).toEqual({ error: null, handedOff: true });
    const start = signInWithOAuth.mock.calls[0]![0];
    expect(start.options?.skipBrowserRedirect).toBe(true);
    expect(start.options?.queryParams).toEqual({ prompt: "select_account" });
    // Returns to the hand-off route with the guarded `next` and a flow value
    // the shell will expect back; nothing else.
    const back = returnsTo(start);
    expect(`${back.origin}${back.pathname}`).toBe("https://app.frapp.live/auth/desktop");
    expect([...back.searchParams.keys()]).toEqual(["next", "flow"]);
    expect(back.searchParams.get("next")).toBe("/join?token=inv-1");
    expect(back.searchParams.get("flow")).toMatch(/^[0-9a-f-]{36}$/);
    expect(openExternal).toHaveBeenCalledWith(AUTHORIZE);
  });

  it("gives every sign-in its own flow value", async () => {
    const signInWithOAuth = started();
    const start = () =>
      startWebOAuth({ auth: { signInWithOAuth } }, "apple", "https://app.frapp.live", "/chat", undefined, {
        openExternal: async () => true,
      });
    await start();
    await start();
    const flows = signInWithOAuth.mock.calls.map(
      ([call]) => returnsTo(call).searchParams.get("flow"),
    );
    expect(flows[0]).not.toBe(flows[1]);
  });

  it("uses the shell's bridge when the page is running inside the desktop app", async () => {
    const openExternal = vi.fn(async () => true);
    vi.stubGlobal("window", { frappDesktop: { openExternal } });

    const result = await startWebOAuth(
      { auth: { signInWithOAuth: started() } },
      "google",
      "https://app.frapp.live",
      "/chat",
    );

    expect(result.handedOff).toBe(true);
    expect(openExternal).toHaveBeenCalledWith(AUTHORIZE);
  });

  it("is an error, not a hand-off, when the shell refuses or fails to open the address", async () => {
    for (const openExternal of [
      async () => false,
      async () => undefined as unknown as boolean,
      async () => {
        throw new Error("no handler");
      },
    ]) {
      const result = await startWebOAuth(
        { auth: { signInWithOAuth: started() } },
        "google",
        "https://app.frapp.live",
        "/chat",
        undefined,
        { openExternal },
      );
      expect(result.handedOff).toBe(false);
      expect(result.error).not.toBeNull();
    }
  });

  it("opens nothing when the start is refused", async () => {
    const openExternal = vi.fn(async () => true);
    const result = await startWebOAuth(
      {
        auth: {
          signInWithOAuth: vi.fn(async () => ({
            data: { url: null },
            error: { message: "provider is not enabled" },
          })),
        },
      },
      "apple",
      "https://app.frapp.live",
      "/chat",
      undefined,
      { openExternal },
    );
    expect(result.handedOff).toBe(false);
    expect(result.error?.message).toBe("provider is not enabled");
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("reports a start that came back with no address", async () => {
    const openExternal = vi.fn(async () => true);
    const result = await startWebOAuth(
      { auth: { signInWithOAuth: vi.fn(async () => ({ data: { url: null }, error: null })) } },
      "google",
      "https://app.frapp.live",
      "/chat",
      undefined,
      { openExternal },
    );
    expect(result.handedOff).toBe(false);
    expect(result.error).not.toBeNull();
    expect(openExternal).not.toHaveBeenCalled();
  });
});

describe("startWebOAuth", () => {
  it("starts PKCE OAuth toward /auth/callback with the guarded next path", async () => {
    const signInWithOAuth = vi.fn(async () => ({ error: null }));
    const supabase = { auth: { signInWithOAuth } };

    const result = await startWebOAuth(
      supabase,
      "google",
      "https://app.frapp.live",
      "/join?token=inv-1",
    );

    expect(result.error).toBeNull();
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo:
          "https://app.frapp.live/auth/callback?next=%2Fjoin%3Ftoken%3Dinv-1",
        queryParams: { prompt: "select_account" },
      },
    });
  });

  it("does not send Google prompt params for Apple", async () => {
    const signInWithOAuth = vi.fn(async () => ({ error: null }));
    await startWebOAuth(
      { auth: { signInWithOAuth } },
      "apple",
      "https://app.staging.frapp.live",
      "/chat",
    );
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "apple",
      options: {
        redirectTo: "https://app.staging.frapp.live/auth/callback?next=%2Fchat",
        queryParams: undefined,
      },
    });
  });

  it("refuses an off-origin next the same way magic-link does", async () => {
    const signInWithOAuth = vi.fn(async () => ({ error: null }));
    await startWebOAuth(
      { auth: { signInWithOAuth } },
      "apple",
      "https://app.frapp.live",
      "https://evil.example/phish",
    );
    expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          redirectTo: "https://app.frapp.live/auth/callback?next=%2Fchat",
        }),
      }),
    );
  });

  it("returns the provider error so the screen can map collision copy", async () => {
    const signInWithOAuth = vi.fn(async () => ({
      error: { message: "already been registered", code: "identity_already_exists" },
    }));
    const result = await startWebOAuth(
      { auth: { signInWithOAuth } },
      "google",
      "https://app.frapp.live",
      "/chat",
    );
    expect(result.error).toEqual({
      message: "already been registered",
      code: "identity_already_exists",
    });
  });
});

describe("startWebOAuth from the sign-in screen", () => {
  it("tags the callback as a sign-in", async () => {
    const signInWithOAuth = vi.fn(async () => ({ error: null }));
    await startWebOAuth(
      { auth: { signInWithOAuth } },
      "google",
      "https://app.frapp.live",
      "/chat",
      "sign-in",
    );
    expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          redirectTo:
            "https://app.frapp.live/auth/callback?next=%2Fchat&intent=sign-in",
        }),
      }),
    );
  });
});
