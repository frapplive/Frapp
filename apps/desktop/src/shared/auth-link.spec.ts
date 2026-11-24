import { describe, expect, it } from "vitest";
import { AUTH_LINK_WINDOW_MS, createAuthLinkGate, findAuthLink, parseAuthLink, readAuthFlow } from "./auth-link";

const ORIGIN = "https://app.frapp.live";
const FLOW = "3f2c9a1e-aaaa-4bbb-8ccc-1234567890ab";
const OTHER_FLOW = "99999999-aaaa-4bbb-8ccc-1234567890ab";

/** Supabase Auth's `authorize` address for a sign-in returning to `redirectTo`. */
function authorize(redirectTo: string): string {
  return `https://abcdefgh.supabase.co/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}&code_challenge=x`;
}

describe("parseAuthLink", () => {
  it("turns a returning sign-in into the app's own callback route", () => {
    expect(
      parseAuthLink(`frapp-desktop://auth/callback?next=%2Fjoin%3Ftoken%3Dinv-1&flow=${FLOW}&code=abc-123`, ORIGIN),
    ).toEqual({
      target: "https://app.frapp.live/auth/callback?code=abc-123&next=%2Fjoin%3Ftoken%3Dinv-1",
      flow: FLOW,
    });
  });

  it("loads the origin the shell is showing, never one the link names", () => {
    expect(
      parseAuthLink(`frapp-desktop://auth/callback?code=abc&flow=${FLOW}`, "https://app.staging.frapp.live")?.target,
    ).toBe("https://app.staging.frapp.live/auth/callback?code=abc");
  });

  it("drops every parameter the callback route doesn't need", () => {
    expect(
      parseAuthLink(
        `frapp-desktop://auth/callback?code=abc&flow=${FLOW}&token_hash=x&type=recovery&intent=confirm&evil=1`,
        ORIGIN,
      )?.target,
    ).toBe("https://app.frapp.live/auth/callback?code=abc");
  });

  it("ignores anything but auth/callback with a code and a flow", () => {
    for (const link of [
      "frapp-desktop://auth/callback",
      `frapp-desktop://auth/callback?flow=${FLOW}`,
      `frapp-desktop://auth/callback?code=&flow=${FLOW}`,
      "frapp-desktop://auth/callback?code=abc",
      "frapp-desktop://auth/callback?code=abc&flow=short",
      "frapp-desktop://auth/callback?code=abc&flow=has%20spaces%20in%20the%20value",
      `frapp-desktop://auth/callback?error=access_denied&flow=${FLOW}`,
      `frapp-desktop://auth/callback?code=a%20b&flow=${FLOW}`,
      `frapp-desktop://auth/callback?code=a/../../x&flow=${FLOW}`,
      `frapp-desktop://auth/other?code=abc&flow=${FLOW}`,
      `frapp-desktop://auth/callback/extra?code=abc&flow=${FLOW}`,
      `frapp-desktop://chat/callback?code=abc&flow=${FLOW}`,
      `frapp-desktop://user:pass@auth/callback?code=abc&flow=${FLOW}`,
      `frapp-desktop://auth:8443/callback?code=abc&flow=${FLOW}`,
      `frapp-desktop:auth/callback?code=abc&flow=${FLOW}`,
      `frapp://auth/callback?code=abc&flow=${FLOW}`,
      `https://app.frapp.live/auth/callback?code=abc&flow=${FLOW}`,
      `frapp-desktop://auth/callback?code=abc&flow=${FLOW}&next=${"a".repeat(5000)}`,
      "nope",
      "",
      null,
      undefined,
      42,
    ]) {
      expect(parseAuthLink(link, ORIGIN), String(link)).toBeNull();
    }
  });
});

describe("readAuthFlow", () => {
  it("reads the flow of a sign-in that returns to this app's hand-off route", () => {
    expect(readAuthFlow(authorize(`${ORIGIN}/auth/desktop?next=%2Fchat&flow=${FLOW}`), ORIGIN)).toBe(FLOW);
  });

  it("is null for a sign-in that returns anywhere else, or names no flow", () => {
    for (const redirectTo of [
      `${ORIGIN}/auth/callback?next=%2Fchat&flow=${FLOW}`,
      `https://app.staging.frapp.live/auth/desktop?flow=${FLOW}`,
      `https://evil.example/auth/desktop?flow=${FLOW}`,
      `${ORIGIN}/auth/desktop?next=%2Fchat`,
      `${ORIGIN}/auth/desktop?flow=short`,
      "not a url",
    ]) {
      expect(readAuthFlow(authorize(redirectTo), ORIGIN), redirectTo).toBeNull();
    }
    expect(readAuthFlow("https://abcdefgh.supabase.co/auth/v1/authorize?provider=google", ORIGIN)).toBeNull();
    expect(readAuthFlow("nope", ORIGIN)).toBeNull();
  });
});

describe("createAuthLinkGate", () => {
  const start = authorize(`${ORIGIN}/auth/desktop?next=%2Fchat&flow=${FLOW}`);
  const link = `frapp-desktop://auth/callback?code=abc&flow=${FLOW}`;
  const target = "https://app.frapp.live/auth/callback?code=abc";

  it("takes the link that answers the sign-in the member started, once", () => {
    const gate = createAuthLinkGate();
    expect(gate.arm(start, ORIGIN)).toBe(true);
    expect(gate.accept(link, ORIGIN)).toBe(target);
    expect(gate.accept(link, ORIGIN)).toBeNull();
  });

  it("ignores every link when no sign-in was started here", () => {
    expect(createAuthLinkGate().accept(link, ORIGIN)).toBeNull();
  });

  it("refuses to expect a sign-in that doesn't return to this app", () => {
    const gate = createAuthLinkGate();
    expect(gate.arm(authorize(`https://evil.example/auth/desktop?flow=${FLOW}`), ORIGIN)).toBe(false);
    expect(gate.accept(link, ORIGIN)).toBeNull();
  });

  it("leaves the real sign-in waiting when another flow's link, or a malformed one, arrives first", () => {
    const gate = createAuthLinkGate();
    gate.arm(start, ORIGIN);
    expect(gate.accept(`frapp-desktop://auth/callback?code=stolen&flow=${OTHER_FLOW}`, ORIGIN)).toBeNull();
    expect(gate.accept("frapp-desktop://auth/callback?code=abc", ORIGIN)).toBeNull();
    expect(gate.accept("frapp-desktop://chat", ORIGIN)).toBeNull();
    expect(gate.accept(link, ORIGIN)).toBe(target);
  });

  it("expects only the latest sign-in when the member starts again", () => {
    const gate = createAuthLinkGate();
    gate.arm(start, ORIGIN);
    gate.arm(authorize(`${ORIGIN}/auth/desktop?flow=${OTHER_FLOW}`), ORIGIN);
    expect(gate.accept(link, ORIGIN)).toBeNull();
    expect(gate.accept(`frapp-desktop://auth/callback?code=new&flow=${OTHER_FLOW}`, ORIGIN)).toBe(
      "https://app.frapp.live/auth/callback?code=new",
    );
  });

  it("stops expecting a sign-in ten minutes after it started", () => {
    let now = 1_000;
    const gate = createAuthLinkGate(() => now);
    gate.arm(start, ORIGIN);
    now += AUTH_LINK_WINDOW_MS + 1;
    expect(gate.accept(link, ORIGIN)).toBeNull();
    now = 1_000;
    expect(gate.accept(link, ORIGIN)).toBeNull();
  });
});

describe("findAuthLink", () => {
  it("finds the link Windows passes as a launch argument", () => {
    expect(
      findAuthLink(["C:\\Frapp\\Frapp.exe", "--allow-file-access", "frapp-desktop://auth/callback?code=abc"]),
    ).toBe("frapp-desktop://auth/callback?code=abc");
  });

  it("is null for an ordinary launch", () => {
    expect(findAuthLink(["C:\\Frapp\\Frapp.exe", "--hidden"])).toBeNull();
  });
});
