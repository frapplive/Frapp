// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const spies = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useAddToTaskGroup: () => ({
    mutateAsync: spies.mutateAsync,
    isPending: false,
  }),
  useCurrentUser: () => ({ data: { id: "u-paul" } }),
  useMembers: () => ({
    data: [
      { user_id: "u-paul", display_name: "Paul Carlson", role_ids: [] },
      { user_id: "u-sam", display_name: "Sam Ortiz", role_ids: [] },
      { user_id: "u-alex", display_name: "Alex Kim", role_ids: [] },
    ],
    isError: false,
    refetch: vi.fn(),
  }),
  useRoles: () => ({ data: [] }),
  useRoleTiers: () => ({ data: [] }),
  useGroups: () => ({ data: [] }),
  useMemberDisplayNames: () => ({
    avatarTintFor: () => null,
    nameFor: () => null,
    avatarFor: () => null,
  }),
}));

vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: spies.toast }),
}));

import { AddPeople } from "./task-panel";

describe("AddPeople (#5905)", () => {
  beforeEach(() => {
    spies.mutateAsync.mockReset();
    spies.toast.mockReset();
  });

  it("adds only the people picked, and says how many got it", async () => {
    spies.mutateAsync.mockResolvedValue({
      added: ["u-sam"],
      group: { id: "g1", audience: "people", total: 2, done: 0, confirmed: 0 },
    });
    render(<AddPeople taskId="t-1" holders={["u-paul"]} disabled={false} />);

    await userEvent.click(screen.getByRole("button", { name: "Add people" }));
    expect(
      screen.getByRole("checkbox", { name: /Paul Carlson\s*has it/ }),
    ).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: /Sam Ortiz/ }));
    await userEvent.click(screen.getByRole("button", { name: "Add 1" }));

    expect(spies.mutateAsync).toHaveBeenCalledWith({
      id: "t-1",
      assigneeIds: ["u-sam"],
    });
    expect(spies.toast).toHaveBeenCalledWith({
      title: "Added 1 person to this task.",
    });
  });

  it("is held while the task can't be changed", () => {
    render(<AddPeople taskId="t-1" holders={["u-paul"]} disabled />);
    expect(screen.getByRole("button", { name: "Add people" })).toBeDisabled();
  });
});
