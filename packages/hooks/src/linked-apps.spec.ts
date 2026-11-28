import { describe, expect, it } from "vitest";
import { describeIdentityLinkError } from "./auth-error-copy";
import {
  discordLinkedState,
  googleCalendarLinkedState,
  loadSignInMethods,
  signInMethodsFrom,
} from "./linked-apps";

const OFF = {
  available: true,
  connected: false,
  status: null,
  google_email: null,
} as const;

describe("googleCalendarLinkedState", () => {
  it("draws no row where the server doesn't offer Google Calendar", () => {
    expect(googleCalendarLinkedState(undefined)).toBeNull();
    expect(googleCalendarLinkedState({ ...OFF, available: false })).toBeNull();
  });

  it("is grey until connected", () => {
    expect(googleCalendarLinkedState(OFF)?.tone).toBe("off");
  });

  it("is a check with the account once connected", () => {
    expect(
      googleCalendarLinkedState({
        ...OFF,
        connected: true,
        status: "active",
        google_email: "a@b.com",
      }),
    ).toEqual({ tone: "connected", detail: "a@b.com" });
  });

  it("is red once Google stopped honoring the sign-in", () => {
    expect(
      googleCalendarLinkedState({
        ...OFF,
        connected: true,
        status: "needs_reconnect",
        google_email: "a@b.com",
      })?.tone,
    ).toBe("expired");
  });
});

describe("discordLinkedState", () => {
  it("names the linked account", () => {
    expect(
      discordLinkedState({ linked: true, discord_username: "paul" }),
    ).toEqual({ tone: "connected", detail: "paul" });
  });

  it("draws no row while linking isn't offered", () => {
    expect(discordLinkedState({ linked: false, available: false })).toBeNull();
    expect(discordLinkedState(undefined)).toBeNull();
  });

  it("is grey while not linked", () => {
    expect(discordLinkedState({ linked: false, available: true })?.tone).toBe(
      "off",
    );
  });
});

describe("signInMethodsFrom", () => {
  it("lists every method, checking the ones on the account", () => {
    const rows = signInMethodsFrom(
      [
        { provider: "google", identity_data: { email: "g@gmail.com" } },
        { provider: "email", identity_data: {} },
      ],
      "me@school.edu",
    );
    expect(rows.map((r) => [r.key, r.tone, r.detail])).toEqual([
      ["email", "connected", "me@school.edu"],
      ["google", "connected", "g@gmail.com"],
      ["apple", "off", "Not set up"],
    ]);
  });

  it("offers Link on Google and Apple when they're missing, never on Email (#2223)", () => {
    const rows = signInMethodsFrom([{ provider: "email" }], "a@b.com");
    expect(rows.map((r) => [r.key, r.canLink, r.canUnlink])).toEqual([
      ["email", false, false],
      ["google", true, false],
      ["apple", true, false],
    ]);
  });

  it("offers Unlink on Google or Apple only while another way in is left", () => {
    const google = { provider: "google", identity_data: {} };
    const alone = signInMethodsFrom([google]);
    expect(alone.find((r) => r.key === "google")).toMatchObject({
      canUnlink: false,
      identity: google,
    });
    const both = signInMethodsFrom([{ provider: "email" }, google]);
    expect(both.find((r) => r.key === "google")?.canUnlink).toBe(true);
    // Email is the account's own address: never unlinked here.
    expect(both.find((r) => r.key === "email")?.canUnlink).toBe(false);
  });
});

describe("loadSignInMethods", () => {
  it("throws on a failed identities read rather than listing nothing", async () => {
    await expect(
      loadSignInMethods({
        getUserIdentities: async () => ({ data: null, error: new Error("x") }),
        getUser: async () => ({ data: { user: null } }),
      }),
    ).rejects.toThrow("x");
  });

  it("labels the email method Email, since a magic-link account has it too", async () => {
    const rows = await loadSignInMethods({
      getUserIdentities: async () => ({
        data: { identities: [{ provider: "email", identity_data: {} }] },
        error: null,
      }),
      getUser: async () => ({ data: { user: { email: "a@b.com" } } }),
    });
    expect(rows[0]).toMatchObject({ label: "Email", detail: "a@b.com" });
  });
});

describe("describeIdentityLinkError", () => {
  it("names the provider account that already belongs to someone else", () => {
    expect(
      describeIdentityLinkError({ code: "identity_already_exists" }, "Google"),
    ).toMatch(/That Google account already signs in to a different Frapp account/);
  });

  it("says linking is off rather than echoing GoTrue", () => {
    expect(
      describeIdentityLinkError(
        { code: "manual_linking_disabled", message: "Manual linking is disabled" },
        "Apple",
      ),
    ).toBe("Linking another sign-in method isn't turned on yet. Try again later.");
  });

  it("says a provider the project hasn't set up isn't available", () => {
    expect(
      describeIdentityLinkError(
        {
          code: "validation_failed",
          message: "Unsupported provider: provider is not enabled",
        },
        "Google",
      ),
    ).toBe("Signing in with Google isn't available yet.");
  });

  it("falls back to the shared copy, never the server's sentence", () => {
    expect(
      describeIdentityLinkError({ message: "raw gotrue text" }, "Apple"),
    ).not.toContain("raw gotrue text");
  });
});
