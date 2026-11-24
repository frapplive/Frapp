import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * "How the chapter sees you" on the web (#5627): the same screen as the
 * phone's s03 first screen, then chat.
 */
const mocks = vi.hoisted(() => ({
  user: undefined as Record<string, unknown> | undefined,
  isError: false,
  offline: false,
  updateUser: vi.fn(),
  completeOnboarding: vi.fn(),
  replace: vi.fn(),
  refetch: vi.fn(),
  /** The member's verified schools (#5929): one, so chat is next. */
  schools: [{ school: { id: "s-1" } }] as unknown[],
}));

vi.mock("@repo/hooks", () => ({
  useCurrentUser: () => ({
    data: mocks.user,
    isPending: mocks.user === undefined && !mocks.isError,
    isError: mocks.isError,
    refetch: mocks.refetch,
  }),
  useUpdateUser: () => ({ mutateAsync: mocks.updateUser }),
  useUpdateOnboarding: () => ({ mutateAsync: mocks.completeOnboarding }),
  useActiveChapterId: () => "ch-1",
  useMySchools: () => ({ data: mocks.schools }),
  useCurrentChapter: () => ({
    data: { university: "Rensselaer Polytechnic Institute" },
  }),
  usePermissionList: () => [],
  useChapterMajors: () => [],
}));
/** The school step has its own spec; here it only has to be reached. */
vi.mock("@/components/onboarding/school-step", () => ({
  SchoolStep: ({
    initialQuery,
    onLeave,
  }: {
    initialQuery: string;
    onLeave: () => void;
  }) => (
    <div>
      <p>school step: {initialQuery}</p>
      <button type="button" onClick={onLeave}>
        Not a student? Skip for now
      </button>
    </div>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/lib/providers/network-provider", () => ({
  useNetwork: () => ({ isOffline: mocks.offline, probeOnce: vi.fn() }),
}));
/** The photo control has its own spec; here it only has to be there. */
vi.mock("@/components/profile/profile-photo-control", () => ({
  ProfilePhotoControl: ({ hasPhoto }: { hasPhoto: boolean }) => (
    <button type="button">{hasPhoto ? "Change photo" : "Add photo"}</button>
  ),
}));

import { WelcomeYou } from "./welcome-you";

const ADA = {
  id: "u-1",
  display_name: "Ada Lovelace",
  email: "ada@example.edu",
  avatar_url: null,
  // All four of About you's fields, so these tests go straight to chat.
  phone: "+15185550142",
  major: "Mathematics",
  graduation_year: 2027,
  birthday_month: 12,
  birthday_day: 10,
  birthday_year: null,
  birthday_visibility: "nobody",
};

const field = () => screen.getByLabelText("Your name") as HTMLInputElement;
const goToChat = () => screen.getByRole("button", { name: "Go to chat" });

describe("WelcomeYou", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = ADA;
    mocks.isError = false;
    mocks.offline = false;
    mocks.updateUser.mockResolvedValue({});
    mocks.completeOnboarding.mockResolvedValue({});
    mocks.schools = [{ school: { id: "s-1" } }];
    window.localStorage.clear();
  });

  describe("the school step (#5929)", () => {
    it("asks a member with no verified school, from the chapter's school", async () => {
      mocks.schools = [];
      render(<WelcomeYou />);

      fireEvent.click(screen.getByRole("button", { name: "Continue" }));

      expect(
        await screen.findByText(
          "school step: Rensselaer Polytechnic Institute",
        ),
      ).toBeTruthy();
      expect(mocks.completeOnboarding).toHaveBeenCalledWith({
        has_completed_onboarding: true,
      });
      expect(mocks.replace).not.toHaveBeenCalled();

      fireEvent.click(
        screen.getByRole("button", { name: "Not a student? Skip for now" }),
      );
      expect(mocks.replace).toHaveBeenCalledWith("/chat");
    });

    it("goes straight to chat for a member already verified at a school", async () => {
      render(<WelcomeYou />);

      fireEvent.click(goToChat());

      await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/chat"));
      expect(screen.queryByText(/school step/)).toBeNull();
    });
  });

  it("says the phone's words, with a real name pre-filled and a photo to add", () => {
    render(<WelcomeYou />);

    expect(
      screen.getByRole("heading", { name: "How the chapter sees you" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Your photo and name go on every message you send."),
    ).toBeTruthy();
    expect(field().value).toBe("Ada Lovelace");
    expect(screen.getByRole("button", { name: "Add photo" })).toBeTruthy();
  });

  it("goes to chat without resending a name that didn't change", async () => {
    render(<WelcomeYou />);

    fireEvent.click(goToChat());

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/chat"));
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.completeOnboarding).toHaveBeenCalledWith({
      has_completed_onboarding: true,
    });
    // The welcome card waits in the default channel.
    expect(window.localStorage.getItem("frapp.welcome-due")).toMatch(
      /^u-1:ch-1:\d+$/,
    );
  });

  it("starts empty for the email before the @, and needs a name first", async () => {
    mocks.user = { ...ADA, display_name: "ada" };
    render(<WelcomeYou />);

    expect(field().value).toBe("");
    fireEvent.click(goToChat());
    expect(
      await screen.findByText(
        "Add your name so the chapter knows who's talking.",
      ),
    ).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();

    fireEvent.change(field(), { target: { value: "  Ada King " } });
    expect(
      screen.queryByText("Add your name so the chapter knows who's talking."),
    ).toBeNull();
    fireEvent.click(goToChat());

    await waitFor(() =>
      expect(mocks.updateUser).toHaveBeenCalledWith({
        display_name: "Ada King",
      }),
    );
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/chat"));
  });

  it("never pre-fills the Member stand-in", () => {
    mocks.user = { ...ADA, display_name: "Member" };
    render(<WelcomeYou />);

    expect(field().value).toBe("");
  });

  it("stays, with the reason and the name, when the name can't be saved", async () => {
    mocks.updateUser.mockRejectedValueOnce(new Error("offline"));
    render(<WelcomeYou />);
    fireEvent.change(field(), { target: { value: "Ada King" } });

    fireEvent.click(goToChat());

    expect(
      await screen.findByText(
        "Couldn't save your name. Check your connection and try again.",
      ),
    ).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
    // The join notices go out on that PATCH (#5627), so never before the
    // name is saved.
    expect(mocks.completeOnboarding).not.toHaveBeenCalled();
    expect(field().value).toBe("Ada King");
    expect((goToChat() as HTMLButtonElement).disabled).toBe(false);
  });

  it("saves the name before finishing, so the notices carry it", async () => {
    const order: string[] = [];
    mocks.updateUser.mockImplementation(async () => order.push("name"));
    mocks.completeOnboarding.mockImplementation(async () =>
      order.push("finish"),
    );
    mocks.user = { ...ADA, display_name: "evan", email: "evan@example.com" };
    render(<WelcomeYou />);

    // Typed by evan@example.com, "Evan" is their name, not the email.
    fireEvent.change(field(), { target: { value: "Evan" } });
    fireEvent.click(goToChat());

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/chat"));
    expect(mocks.updateUser).toHaveBeenCalledWith({ display_name: "Evan" });
    expect(order).toEqual(["name", "finish"]);
  });

  it("shows a locked name read-only and finishes without sending it (#5801)", async () => {
    mocks.user = { ...ADA, display_name: "Member", display_name_locked: true };
    render(<WelcomeYou />);

    expect(field().value).toBe("Member");
    expect(field().readOnly).toBe(true);
    expect(screen.getByText("Your chapter's officers set names.")).toBeTruthy();
    fireEvent.click(goToChat());

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/chat"));
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("offers a retry when the profile can't be read", () => {
    mocks.user = undefined;
    mocks.isError = true;
    render(<WelcomeYou />);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.refetch).toHaveBeenCalled();
  });
});

describe("About you (#5284)", () => {
  const NEW = { ...ADA, phone: null, major: null, graduation_year: null };
  const continueButton = () => screen.getByRole("button", { name: "Continue" });
  const toAbout = async () => {
    render(<WelcomeYou />);
    fireEvent.click(continueButton());
    await screen.findByRole("heading", { name: "About you" });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = NEW;
    mocks.isError = false;
    mocks.offline = false;
    mocks.updateUser.mockResolvedValue({});
    mocks.completeOnboarding.mockResolvedValue({});
    window.localStorage.clear();
  });

  it("follows the name when a field is empty, saying why it asks", async () => {
    await toAbout();

    expect(
      screen.getByText(
        "Officers use this to reach you, and it fills in your profile in the directory.",
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText("Phone")).toBeTruthy();
    expect(screen.getByLabelText("Major")).toBeTruthy();
    expect(screen.getByLabelText("Graduation year")).toBeTruthy();
    expect(mocks.completeOnboarding).not.toHaveBeenCalled();
  });

  it("Skip for now saves nothing and goes to chat", async () => {
    await toAbout();
    fireEvent.change(screen.getByLabelText("Major"), {
      target: { value: "Physics" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/chat"));
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.completeOnboarding).toHaveBeenCalled();
  });

  it("Go to chat saves only the fields that changed", async () => {
    await toAbout();
    fireEvent.change(screen.getByLabelText("Major"), {
      target: { value: " Physics " },
    });
    fireEvent.change(screen.getByLabelText("Graduation year"), {
      target: { value: "2029" },
    });

    fireEvent.click(goToChat());

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/chat"));
    expect(mocks.updateUser).toHaveBeenCalledTimes(1);
    expect(mocks.updateUser).toHaveBeenCalledWith({
      major: "Physics",
      graduation_year: 2029,
    });
  });

  it("refuses a phone the API would, and sends nothing", async () => {
    await toAbout();
    fireEvent.change(screen.getByLabelText("Phone"), {
      target: { value: "12" },
    });

    fireEvent.click(goToChat());

    expect(await screen.findByText(/^Enter a phone number/)).toBeTruthy();
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("stays, with the reason and what was typed, when the save fails", async () => {
    await toAbout();
    mocks.updateUser.mockRejectedValueOnce(new Error("offline"));
    fireEvent.change(screen.getByLabelText("Major"), {
      target: { value: "Physics" },
    });

    fireEvent.click(goToChat());

    expect(
      await screen.findByText(
        "Couldn't save that. Check your connection and try again.",
      ),
    ).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.completeOnboarding).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Major") as HTMLInputElement).value).toBe(
      "Physics",
    );
  });

  it("refuses a year outside the API's range, and sends nothing", async () => {
    await toAbout();
    fireEvent.change(screen.getByLabelText("Graduation year"), {
      target: { value: "26" },
    });

    fireEvent.click(goToChat());

    expect(
      await screen.findByText(/^Use a year between 1900 and 2100/),
    ).toBeTruthy();
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("refuses half a birthday, and sends nothing", async () => {
    mocks.user = { ...NEW, birthday_month: 3, birthday_day: null };
    await toAbout();
    fireEvent.change(screen.getByLabelText("Major"), {
      target: { value: "Physics" },
    });
    // Touch the birthday so it is part of the Save.
    fireEvent.change(screen.getByLabelText("Year (optional)"), {
      target: { value: "2004" },
    });

    fireEvent.click(goToChat());

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/day/i),
    );
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
