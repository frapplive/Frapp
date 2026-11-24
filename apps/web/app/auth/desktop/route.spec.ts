import { beforeEach, describe, expect, it, vi } from "vitest";

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException }));

import { GET } from "./route";

const ORIGIN = "https://app.frapp.live";

function handOff(query: string): URL {
  const response = GET(new Request(`${ORIGIN}/auth/desktop?${query}`));
  expect(response.status).toBeGreaterThanOrEqual(300);
  return new URL(response.headers.get("location") as string);
}

describe("GET /auth/desktop", () => {
  beforeEach(() => {
    captureException.mockReset();
  });

  it("sends the code on to the hand-off page under a name no client exchanges", () => {
    const url = handOff("code=abc-123&next=%2Fjoin%3Ftoken%3Dinv-1&flow=f-1");
    expect(`${url.origin}${url.pathname}`).toBe(`${ORIGIN}/desktop-sign-in`);
    expect(url.searchParams.get("code")).toBeNull();
    expect(url.searchParams.get("handoff")).toBe("abc-123");
    expect(url.searchParams.get("next")).toBe("/join?token=inv-1");
    expect(url.searchParams.get("flow")).toBe("f-1");
    expect(captureException).not.toHaveBeenCalled();
  });

  it("never passes on a `next` that leaves the app", () => {
    for (const next of ["https://evil.example/x", "//evil.example/x", "/\\evil.example/x"]) {
      expect(handOff(`code=abc&next=${encodeURIComponent(next)}`).searchParams.get("next")).toBe("/chat");
    }
  });

  it("reports a provider refusal and tells the page why, with no code", () => {
    const url = handOff("error=server_error&error_code=identity_already_exists&code=abc");
    expect(url.pathname).toBe("/desktop-sign-in");
    expect(url.searchParams.get("authError")).toBe("identity_already_exists");
    expect(url.searchParams.get("handoff")).toBeNull();
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0]![1].tags).toMatchObject({
      auth_flow: "auth_callback",
      auth_screen: "/auth/desktop",
    });
  });

  it("reports a return with nothing in it", () => {
    expect(handOff("").searchParams.get("authError")).toBe("missing_code");
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
