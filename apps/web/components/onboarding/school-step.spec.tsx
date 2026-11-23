import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * "Where do you go to school?" on the web (#5929): pick, email, code, done,
 * with a skip at every stage and a school that can't verify yet saying so.
 */
const RPI = {
  id: "s-rpi",
  name: "Rensselaer Polytechnic Institute",
  short_name: "RPI",
  slug: "rpi",
  verifiable: true,
  email_domains: ["rpi.edu"],
};
const ESU = {
  id: "s-esu",
  name: "Example State University",
  short_name: "ESU",
  slug: "esu",
  verifiable: false,
  email_domains: [],
};

const mocks = vi.hoisted(() => ({
  results: [] as unknown[],
  start: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("@repo/hooks", async () => {
  const actual = await vi.importActual<
    typeof import("@repo/hooks/use-schools")
  >("@repo/hooks/use-schools");
  return {
    SCHOOL_SEARCH_MIN_LENGTH: 2,
    schoolStepErrorCopy: actual.schoolStepErrorCopy,
    useSchoolSearch: () => ({
      data: mocks.results,
      isSuccess: true,
      isError: false,
    }),
    useStartSchoolVerification: () => ({
      mutateAsync: mocks.start,
      isPending: false,
    }),
    useConfirmSchoolVerification: () => ({
      mutateAsync: mocks.confirm,
      isPending: false,
    }),
  };
});
vi.mock("@/lib/hooks/use-debounced-value", () => ({
  useDebouncedValue: (value: string) => value,
}));

import { SchoolStep } from "./school-step";

describe("SchoolStep", () => {
  const onLeave = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.results = [RPI, ESU];
    mocks.start.mockResolvedValue({
      email: "ada@rpi.edu",
      expires_at: "2026-11-23T00:10:00Z",
      resend_after_seconds: 60,
    });
    mocks.confirm.mockResolvedValue({});
    // cmdk measures its list.
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    Element.prototype.scrollIntoView ??= () => {};
  });

  it("asks the question, searching from the chapter's school", () => {
    render(<SchoolStep initialQuery="Rensselaer" onLeave={onLeave} />);

    expect(
      screen.getByRole("heading", { name: "Where do you go to school?" }),
    ).toBeTruthy();
    expect((screen.getByLabelText("School") as HTMLInputElement).value).toBe(
      "Rensselaer",
    );
    expect(screen.getByText("Rensselaer Polytechnic Institute")).toBeTruthy();
  });

  it("verifies end to end: school, email, code, then the verified line", async () => {
    render(<SchoolStep initialQuery="Rensselaer" onLeave={onLeave} />);

    fireEvent.click(screen.getByText("Rensselaer Polytechnic Institute"));
    const email = (await screen.findByLabelText(
      "School email",
    )) as HTMLInputElement;
    expect(email.placeholder).toBe("you@rpi.edu");
    fireEvent.change(email, { target: { value: "Ada@rpi.edu" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));

    await waitFor(() =>
      expect(mocks.start).toHaveBeenCalledWith({
        schoolId: "s-rpi",
        email: "Ada@rpi.edu",
      }),
    );
    expect(
      await screen.findByText("Enter the 6-digit code we sent to ada@rpi.edu."),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Send a new code in/ }),
    ).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByLabelText("Code"), {
      target: { value: "123 456" },
    });

    await waitFor(() =>
      expect(mocks.confirm).toHaveBeenCalledWith({
        schoolId: "s-rpi",
        code: "123456",
      }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "You're verified at Rensselaer Polytechnic Institute",
      }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Go to chat" }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("says a school isn't set up yet and lets the member go on", () => {
    render(<SchoolStep initialQuery="Example" onLeave={onLeave} />);

    fireEvent.click(screen.getByText("Example State University"));

    expect(
      screen.getByText("Your school isn't set up for verification yet."),
    ).toBeTruthy();
    expect(screen.queryByLabelText("School email")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Go to chat" }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("shows the API's refusal for an address off the school's domain", async () => {
    mocks.start.mockRejectedValue({
      code: "school.email.wrong_domain",
      message:
        "Use your Rensselaer Polytechnic Institute email, ending in @rpi.edu.",
    });
    render(<SchoolStep initialQuery="Rensselaer" onLeave={onLeave} />);

    fireEvent.click(screen.getByText("Rensselaer Polytechnic Institute"));
    fireEvent.change(await screen.findByLabelText("School email"), {
      target: { value: "ada@gmail.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));

    expect(
      await screen.findByText(
        "Use your Rensselaer Polytechnic Institute email, ending in @rpi.edu.",
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Code")).toBeNull();
  });

  it("never shows a raw error that isn't a school refusal", async () => {
    mocks.start.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<SchoolStep initialQuery="Rensselaer" onLeave={onLeave} />);

    fireEvent.click(screen.getByText("Rensselaer Polytechnic Institute"));
    fireEvent.change(await screen.findByLabelText("School email"), {
      target: { value: "ada@rpi.edu" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));

    expect(
      await screen.findByText(
        "Couldn't send the code. Check your connection and try again.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Failed to fetch")).toBeNull();
  });

  it("clears a wrong code and says so", async () => {
    mocks.confirm.mockRejectedValue({
      code: "school.code.wrong",
      message: "That code isn't right. Check the email and try again.",
    });
    render(<SchoolStep initialQuery="Rensselaer" onLeave={onLeave} />);

    fireEvent.click(screen.getByText("Rensselaer Polytechnic Institute"));
    fireEvent.change(await screen.findByLabelText("School email"), {
      target: { value: "ada@rpi.edu" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    const code = (await screen.findByLabelText("Code")) as HTMLInputElement;
    fireEvent.change(code, { target: { value: "000000" } });

    expect(
      await screen.findByText(
        "That code isn't right. Check the email and try again.",
      ),
    ).toBeTruthy();
    expect(code.value).toBe("");
  });

  it("skips from the first stage", () => {
    render(<SchoolStep initialQuery="" onLeave={onLeave} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Not a student? Skip for now" }),
    );

    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
