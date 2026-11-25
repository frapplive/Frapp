import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockOffline } = vi.hoisted(() => ({ mockOffline: { value: false } }));

const mocks = vi.hoisted(() => ({
  levelQuery: {
    data: "all" as "all" | "mentions" | undefined,
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  setLevel: {
    isPending: false,
    variables: undefined as "all" | "mentions" | undefined,
    mutateAsync: vi.fn<(level: string) => Promise<unknown>>(),
  },
  toast: vi.fn(),
}));

vi.mock("@repo/hooks", () => ({
  useChapterChatLevel: () => mocks.levelQuery,
  useSetChapterChatLevel: () => mocks.setLevel,
}));
vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));
vi.mock("@/lib/providers/network-provider", () => networkMock(mockOffline));

import { networkMock } from "@/tests/network";
import { ChatLevelRow } from "./chat-level-control";

const picker = () => screen.getByRole("combobox", { name: "Chat messages" });

async function pick(name: RegExp) {
  const user = userEvent.setup();
  await user.click(picker());
  await user.click(await screen.findByRole("option", { name }));
}

/**
 * Settings → Notifications → Chat messages on web (#4124): the two choices
 * the phone has (#3840), no Off, saved through the API on the pick. A row
 * whose value opens the picker since #6032.
 */
describe("ChatLevelRow", () => {
  beforeEach(() => {
    mockOffline.value = false;
    mocks.levelQuery.data = "all";
    mocks.levelQuery.isError = false;
    mocks.levelQuery.isLoading = false;
    mocks.setLevel.isPending = false;
    mocks.setLevel.variables = undefined;
    mocks.setLevel.mutateAsync.mockReset();
    mocks.setLevel.mutateAsync.mockResolvedValue({});
    mocks.toast.mockReset();
  });

  it("shows the current level and offers exactly the two, each with its description", async () => {
    mocks.levelQuery.data = "mentions";
    render(<ChatLevelRow />);
    expect(picker()).toHaveTextContent("Mentions and DMs only");
    const user = userEvent.setup();
    await user.click(picker());
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent(/^All messages/);
    expect(options[1]).toHaveTextContent(/^Mentions and DMs only/);
    expect(options[1]).toHaveTextContent(/DMs and announcements still notify/);
    expect(screen.queryByRole("option", { name: /off/i })).toBeNull();
  });

  it("saves the picked level through the API", async () => {
    render(<ChatLevelRow />);
    await pick(/Mentions and DMs only/);
    expect(mocks.setLevel.mutateAsync).toHaveBeenCalledWith("mentions");
  });

  it("shows no level and refuses a pick until the level is read", () => {
    mocks.levelQuery.data = undefined;
    mocks.levelQuery.isLoading = true;
    render(<ChatLevelRow />);
    expect(picker()).toBeDisabled();
    expect(picker()).not.toHaveTextContent(/All messages|Mentions/);
  });

  it("shows the pending pick while it saves", () => {
    mocks.setLevel.isPending = true;
    mocks.setLevel.variables = "mentions";
    render(<ChatLevelRow />);
    expect(picker()).toHaveTextContent("Mentions and DMs only");
  });

  it("says so when the save fails", async () => {
    mocks.setLevel.mutateAsync.mockRejectedValue(new Error("boom"));
    render(<ChatLevelRow />);
    await pick(/Mentions and DMs only/);
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Couldn't change chat notifications",
          variant: "destructive",
        }),
      ),
    );
  });

  it("refuses a change offline and says why, without writing", async () => {
    mockOffline.value = true;
    render(<ChatLevelRow />);
    await pick(/Mentions and DMs only/);
    expect(mocks.setLevel.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "You're offline" }),
    );
  });

  it("offers a retry when the level can't be read", () => {
    mocks.levelQuery.data = undefined;
    mocks.levelQuery.isError = true;
    render(<ChatLevelRow />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.levelQuery.refetch).toHaveBeenCalled();
  });
});
