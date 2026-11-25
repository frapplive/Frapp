import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useOnboardingCustomFields } from "./own-custom-fields";
import { createHookWrapper } from "./test-utils";

const FIELDS = [
  {
    field_id: "cf-contact",
    label: "Emergency contact (name)",
    type: "text",
    required: true,
    visibility: "exec",
    choices: null,
    max_length: null,
    value: null,
  },
];

/** A client whose permissions and fields answer when the test says so. */
function stubClient(permissions: string[]) {
  let answerPermissions!: () => void;
  const permissionsAnswered = new Promise<void>((resolve) => {
    answerPermissions = resolve;
  });
  const GET = vi.fn(async (path: string) => {
    if (path === "/v1/users/me/permissions") {
      await permissionsAnswered;
      return { data: { permissions } };
    }
    if (path === "/v1/members/me/custom-fields") return { data: FIELDS };
    throw new Error(`unexpected ${path}`);
  });
  return { client: { GET }, answerPermissions };
}

describe("useOnboardingCustomFields (#5926)", () => {
  it("isn't settled while the permissions read is still loading", async () => {
    const { client, answerPermissions } = stubClient(["members:view"]);
    const wrapper = createHookWrapper({ client, chapterId: "ch-1" });
    const { result } = renderHook(() => useOnboardingCustomFields(), {
      wrapper,
    });

    expect(result.current.settled).toBe(false);
    answerPermissions();
    await waitFor(() => expect(result.current.data).toEqual(FIELDS));
    expect(result.current.settled).toBe(true);
  });

  it("load waits for the permissions, then the fields", async () => {
    const { client, answerPermissions } = stubClient(["members:view"]);
    const wrapper = createHookWrapper({ client, chapterId: "ch-1" });
    const { result } = renderHook(() => useOnboardingCustomFields(), {
      wrapper,
    });

    let loaded: unknown;
    await act(async () => {
      const pending = result.current.load().then((fields) => {
        loaded = fields;
      });
      answerPermissions();
      await pending;
    });

    expect(loaded).toEqual(FIELDS);
  });

  it("settles with no fields for a member who can't read the directory", async () => {
    const { client, answerPermissions } = stubClient([]);
    const wrapper = createHookWrapper({ client, chapterId: "ch-1" });
    const { result } = renderHook(() => useOnboardingCustomFields(), {
      wrapper,
    });
    answerPermissions();

    await waitFor(() => expect(result.current.settled).toBe(true));
    await expect(result.current.load()).resolves.toEqual([]);
    expect(client.GET).not.toHaveBeenCalledWith(
      "/v1/members/me/custom-fields",
      expect.anything(),
    );
  });

  it("load gives up after its timeout rather than holding the member", async () => {
    const { client } = stubClient(["members:view"]);
    const wrapper = createHookWrapper({ client, chapterId: "ch-1" });
    const { result } = renderHook(() => useOnboardingCustomFields(), {
      wrapper,
    });

    await expect(result.current.load(20)).resolves.toEqual([]);
  });
});
