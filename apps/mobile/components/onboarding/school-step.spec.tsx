/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FrappThemeProvider } from "@/lib/theme";

/**
 * s03's school beat on the phone (#5929): the same stages and words as the
 * web's `/welcome` school step. Pick, email, code, done; a school that can't
 * verify yet says so; a skip under every stage's gold button.
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
vi.mock("@repo/hooks/use-debounced-value", () => ({
  useDebouncedValue: (value: string) => value,
}));

import { SchoolStep } from "./school-step";

type Node = ReactTestRenderer["root"];

function render(
  onLeave: () => void,
  initialQuery = "Rensselaer",
  alreadyVerified: typeof RPI | null = null,
) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <FrappThemeProvider>
        <SchoolStep
          initialQuery={initialQuery}
          onLeave={onLeave}
          alreadyVerified={alreadyVerified}
        />
      </FrappThemeProvider>,
    );
  });
  return tree.root;
}

const texts = (root: Node) =>
  root
    .findAllByType("Text" as never, { deep: true })
    .map((text) => String(text.props.children ?? ""));

/** The Pressable whose own text reads `label`. */
const button = (root: Node, label: string) =>
  root
    .findAllByType("Pressable" as never, { deep: true })
    .find((pressable) =>
      pressable
        .findAllByType("Text" as never, { deep: true })
        .some((text) => text.props.children === label),
    );

const input = (root: Node, label: string) =>
  root
    .findAllByType("TextInput" as never, { deep: true })
    .find((field) => field.props.accessibilityLabel === label);

async function press(target: Node | undefined) {
  expect(target).toBeDefined();
  await act(async () => {
    await target?.props.onPress();
  });
}

async function type(target: Node | undefined, value: string) {
  expect(target).toBeDefined();
  await act(async () => {
    await target?.props.onChangeText(value);
  });
}

describe("SchoolStep (phone)", () => {
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
  });

  it("asks the web's question, searching from the chapter's school", () => {
    const root = render(onLeave);

    expect(texts(root)).toContain("Where do you go to school?");
    expect(input(root, "School")?.props.value).toBe("Rensselaer");
    expect(texts(root)).toContain("Rensselaer Polytechnic Institute");
    expect(button(root, "Not a student? Skip for now")).toBeDefined();
  });

  it("verifies end to end: school, email, code, then the verified line", async () => {
    const root = render(onLeave);

    await press(button(root, "Rensselaer Polytechnic Institute"));
    const email = input(root, "School email");
    expect(email?.props.placeholder).toBe("you@rpi.edu");
    await type(email, "ada@rpi.edu");
    await press(button(root, "Send code"));

    expect(mocks.start).toHaveBeenCalledWith({
      schoolId: "s-rpi",
      email: "ada@rpi.edu",
    });
    expect(texts(root)).toContain(
      "Enter the 6-digit code we sent to ada@rpi.edu.",
    );

    await type(input(root, "Code"), "123456");

    expect(mocks.confirm).toHaveBeenCalledWith({
      schoolId: "s-rpi",
      code: "123456",
    });
    expect(texts(root)).toContain(
      "You're verified at Rensselaer Polytechnic Institute",
    );
    await press(button(root, "Go to chat"));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("says a school isn't set up yet and lets the member go on", async () => {
    const root = render(onLeave, "Example");

    await press(button(root, "Example State University"));

    expect(texts(root)).toContain(
      "Your school isn't set up for verification yet.",
    );
    expect(input(root, "School email")).toBeUndefined();
    await press(button(root, "Go to chat"));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("shows the API's refusal, and never a raw error", async () => {
    mocks.start.mockRejectedValueOnce({
      code: "school.email.wrong_domain",
      message:
        "Use your Rensselaer Polytechnic Institute email, ending in @rpi.edu.",
    });
    const root = render(onLeave);

    await press(button(root, "Rensselaer Polytechnic Institute"));
    await type(input(root, "School email"), "ada@gmail.com");
    await press(button(root, "Send code"));

    expect(texts(root)).toContain(
      "Use your Rensselaer Polytechnic Institute email, ending in @rpi.edu.",
    );

    mocks.start.mockRejectedValueOnce(new Error("internal detail"));
    await press(button(root, "Send code"));

    expect(texts(root)).toContain(
      "Couldn't send the code. Check your connection and try again.",
    );
    expect(texts(root)).not.toContain("internal detail");
  });

  it("opens on the verified line when the member comes back after verifying", () => {
    const root = render(onLeave, "Rensselaer", RPI);

    expect(texts(root)).toContain(
      "You're verified at Rensselaer Polytechnic Institute",
    );
    expect(input(root, "School")).toBeUndefined();
  });

  it("skips from the first stage", async () => {
    const root = render(onLeave);

    await press(button(root, "Not a student? Skip for now"));

    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
