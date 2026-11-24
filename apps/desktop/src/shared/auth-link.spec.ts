import { describe, expect, it } from "vitest";
import { findAuthLink, parseAuthLink } from "./auth-link";

const ORIGIN = "https://app.frapp.live";

describe("parseAuthLink", () => {
  it("turns a returning sign-in into the app's own callback route", () => {
    expect(
      parseAuthLink(
        "frapp-desktop://auth/callback?next=%2Fjoin%3Ftoken%3Dinv-1&intent=sign-in&code=3f2c9a1e-aaaa-4bbb-8ccc-1234567890ab",
        ORIGIN,
      ),
    ).toBe(
      "https://app.frapp.live/auth/callback?code=3f2c9a1e-aaaa-4bbb-8ccc-1234567890ab&next=%2Fjoin%3Ftoken%3Dinv-1&intent=sign-in",
    );
  });

  it("loads the origin the shell is showing, never one the link names", () => {
    expect(parseAuthLink("frapp-desktop://auth/callback?code=abc", "https://app.staging.frapp.live")).toBe(
      "https://app.staging.frapp.live/auth/callback?code=abc",
    );
  });

  it("drops every parameter the callback route doesn't read", () => {
    expect(parseAuthLink("frapp-desktop://auth/callback?code=abc&token_hash=x&type=recovery&evil=1", ORIGIN)).toBe(
      "https://app.frapp.live/auth/callback?code=abc",
    );
  });

  it("ignores anything but auth/callback with a code", () => {
    for (const link of [
      "frapp-desktop://auth/callback",
      "frapp-desktop://auth/callback?code=",
      "frapp-desktop://auth/callback?error=access_denied",
      "frapp-desktop://auth/callback?code=a%20b",
      "frapp-desktop://auth/callback?code=a/../../x",
      "frapp-desktop://auth/other?code=abc",
      "frapp-desktop://auth/callback/extra?code=abc",
      "frapp-desktop://chat/callback?code=abc",
      "frapp-desktop://user:pass@auth/callback?code=abc",
      "frapp-desktop://auth:8443/callback?code=abc",
      "frapp-desktop:auth/callback?code=abc",
      "frapp://auth/callback?code=abc",
      "https://app.frapp.live/auth/callback?code=abc",
      `frapp-desktop://auth/callback?code=abc&next=${"a".repeat(5000)}`,
      "nope",
      "",
      null,
      undefined,
      42,
    ]) {
      expect(parseAuthLink(link, ORIGIN)).toBeNull();
    }
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
