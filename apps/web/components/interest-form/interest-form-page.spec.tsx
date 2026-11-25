import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { InterestFormPage } from "./interest-form-page";

/**
 * The public interest form (#5977): verify first, the approved consent text
 * above Send with the required box, the QR label carried to the
 * submission, and a timed-out proof sending the visitor back with the reason.
 */

const state = vi.hoisted(() => ({
  startMutate: vi.fn(),
  verifyMutate: vi.fn(),
  submitMutate: vi.fn(),
}));

const FORM = {
  slug: "k3mz8qpt2a",
  is_open: true,
  chapter: {
    name: "Phi Gamma Delta",
    university: "RPI",
    mark_text: null,
    accent_color: null,
  },
  blurb: "Come meet us.",
  questions: [
    { id: "q1", type: "short_answer", title: "Your major?", required: true },
  ],
  ask_referrer: true,
  source_label: "tabling-quad",
  verify: { school_name: "RPI", domains: ["rpi.edu"] },
  consent: {
    version: "2026-11-24",
    runs: [
      { text: "By submitting, you share this information with " },
      { text: "Phi Gamma Delta", strong: true },
      { text: " at RPI so they can contact you about joining." },
    ],
    agree_label: "I agree, and I'm 18 or older",
  },
};

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  usePublicInterestForm: () => ({
    isPending: false,
    isError: false,
    data: FORM,
  }),
  useStartInterestFormCode: () => ({
    mutate: state.startMutate,
    isPending: false,
  }),
  useVerifyInterestFormCode: () => ({
    mutate: state.verifyMutate,
    isPending: false,
  }),
  useSubmitInterestForm: () => ({
    mutate: state.submitMutate,
    isPending: false,
  }),
}));

function verify() {
  state.startMutate.mockImplementation((_email, options) =>
    options.onSuccess({ email: "pat@rpi.edu" }),
  );
  state.verifyMutate.mockImplementation((_body, options) =>
    options.onSuccess({
      email: "pat@rpi.edu",
      proof: "proof",
      prefill: null,
    }),
  );
  render(<InterestFormPage slug="k3mz8qpt2a" src="tabling-quad" />);
  fireEvent.change(screen.getByLabelText("School email"), {
    target: { value: "pat@rpi.edu" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  fireEvent.change(screen.getByLabelText("Code"), {
    target: { value: "123456" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Verify" }));
}

describe("the public interest form", () => {
  beforeEach(() => {
    state.startMutate.mockReset();
    state.verifyMutate.mockReset();
    state.submitMutate.mockReset();
  });

  it("asks only for the email until the code is entered", () => {
    render(<InterestFormPage slug="k3mz8qpt2a" src={null} />);
    expect(screen.getByLabelText("School email")).toBeTruthy();
    expect(screen.queryByLabelText("First name")).toBeNull();
    expect(screen.queryByText(/Your major/)).toBeNull();
  });

  it("shows the consent text above Send and requires the 18+ box", () => {
    verify();
    const consent = screen.getByText(
      (_, node) =>
        node?.tagName === "P" &&
        node.textContent ===
          "By submitting, you share this information with Phi Gamma Delta at RPI so they can contact you about joining.",
    );
    const send = screen.getByRole("button", { name: "Send" });
    expect(
      consent.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("First name"), {
      target: { value: "Pat" },
    });
    fireEvent.change(screen.getByLabelText("Last name"), {
      target: { value: "Smith" },
    });
    fireEvent.change(screen.getByLabelText(/Your major/), {
      target: { value: "Physics" },
    });
    fireEvent.click(send);
    expect(state.submitMutate).not.toHaveBeenCalled();
    expect(
      screen.getByText("Tick the box to agree before you send."),
    ).toBeTruthy();

    fireEvent.click(screen.getByLabelText("I agree, and I'm 18 or older"));
    fireEvent.click(send);
    expect(state.submitMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        proof: "proof",
        first_name: "Pat",
        last_name: "Smith",
        answers: { q1: "Physics" },
        source_label: "tabling-quad",
        agree: true,
      }),
      expect.anything(),
    );
  });

  it("goes back to the email step with the reason when the check timed out", () => {
    verify();
    state.submitMutate.mockImplementation((_body, options) =>
      options.onError({ code: "interest_form.proof.invalid" }),
    );
    fireEvent.change(screen.getByLabelText("First name"), {
      target: { value: "Pat" },
    });
    fireEvent.change(screen.getByLabelText("Last name"), {
      target: { value: "Smith" },
    });
    fireEvent.change(screen.getByLabelText(/Your major/), {
      target: { value: "Physics" },
    });
    fireEvent.click(screen.getByLabelText("I agree, and I'm 18 or older"));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByLabelText("School email")).toBeTruthy();
    expect(screen.getByText(/Your check timed out/)).toBeTruthy();
  });
});
