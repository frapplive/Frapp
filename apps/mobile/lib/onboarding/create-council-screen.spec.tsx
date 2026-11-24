/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { useLocalSearchParams, useRouter } from "expo-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MySchool } from "@repo/hooks";
import { LEGAL_ACCEPTANCE_LABEL } from "@repo/validation";
import { FrappThemeProvider } from "@/lib/theme";
import { screenText } from "@/test/screen-text";

/**
 * Start a council on the phone (#5933): `/create-chapter?kind=council`. These
 * pin the steps a founder walks for each count of verified schools, the
 * title pick with "Something else", the body `POST /v1/councils` gets, and
 * what a refused create and a failed switch leave on screen.
 */

vi.mock("@/lib/auth-session", () => ({
  useAuthSession: () => ({
    status: "authenticated",
    chapterId: null,
    email: "founder@rpi.edu",
    signOut: vi.fn(),
  }),
}));

const selectChapter = vi.fn();
vi.mock("@/lib/select-chapter", () => ({
  useSelectChapter: () => selectChapter,
}));

vi.mock("@/lib/haptics", () => ({ successHaptic: vi.fn() }));

let mySchools: MySchool[] = [];
const createCouncil = vi.fn();
vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useMySchools: () => ({
    data: mySchools,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useCreateCouncil: () => ({ isPending: false, mutateAsync: createCouncil }),
  useSchoolSearch: () => ({ data: [], isSuccess: true, isError: false }),
  useStartSchoolVerification: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useConfirmSchoolVerification: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useCurrentChapter: () => ({ data: undefined }),
}));

import CreateTenant from "@/app/(auth)/create-chapter";
import { COUNCIL_FORM_COPY } from "./council-form";

type Node = ReactTestRenderer["root"];

function school(id: string, name: string, short: string): MySchool {
  return {
    school: {
      id,
      name,
      short_name: short,
      slug: null,
      verifiable: true,
      email_domains: [`${short.toLowerCase()}.edu`],
    },
    status: "member",
    verified_email: `founder@${short.toLowerCase()}.edu`,
    verified_at: "2026-11-20T00:00:00Z",
  } as MySchool;
}

const RPI = school("school-rpi", "Rensselaer Polytechnic Institute", "RPI");
const UNION = school("school-union", "Union College", "Union");

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
}

async function render(): Promise<ReactTestRenderer> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <QueryClientProvider client={queryClient}>
        <FrappThemeProvider>
          <CreateTenant />
        </FrappThemeProvider>
      </QueryClientProvider>,
    );
  });
  await settle();
  return tree;
}

function title(root: Node): string {
  const header = root
    .findAllByType("Text" as never, { deep: true })
    .find((t) => t.props.accessibilityRole === "header");
  return String(header?.props.children ?? "");
}

/** The pressable whose own text is `label`, or whose label is. */
function control(root: Node, label: string) {
  return root
    .findAllByType("Pressable" as never, { deep: true })
    .find(
      (pressable) =>
        pressable.props.accessibilityRole !== "radio" &&
        (pressable.props.accessibilityLabel === label ||
          pressable
            .findAllByType("Text" as never, { deep: true })
            .some((text) => text.props.children === label)),
    );
}

async function press(root: Node, label: string): Promise<void> {
  const target = control(root, label);
  if (!target) throw new Error(`No control "${label}"`);
  await act(async () => {
    target.props.onPress();
  });
  await settle();
}

/** A row in the title sheet, by its label. */
async function pickTitle(root: Node, label: string): Promise<void> {
  const radio = root
    .findAllByType("Pressable" as never, { deep: true })
    .find(
      (p) =>
        p.props.accessibilityRole === "radio" &&
        p.props.accessibilityLabel === label,
    );
  if (!radio) throw new Error(`No title "${label}"`);
  await act(async () => {
    radio.props.onPress();
  });
  await settle();
}

function field(root: Node, label: string) {
  return root
    .findAllByType("TextInput" as never, { deep: true })
    .find((input) => input.props.accessibilityLabel === label);
}

function typeInto(root: Node, label: string, value: string): void {
  const input = field(root, label);
  if (!input) throw new Error(`No field "${label}"`);
  act(() => {
    input.props.onChangeText(value);
  });
}

/** The create button: the gold one pinned last. */
function primary(root: Node) {
  const pressables = root.findAllByType("Pressable" as never, { deep: true });
  return pressables
    .filter((p) => p.props.accessibilityRole !== "radio")
    .at(-1)!;
}

async function pressPrimary(root: Node): Promise<void> {
  await act(async () => {
    primary(root).props.onPress();
  });
  await settle();
}

/** From the type step to a complete IFC form, Terms ticked. */
async function fillIfc(root: Node, titleLabel = "VP Recruitment") {
  await press(root, "Interfraternity Council");
  await pickTitle(root, titleLabel);
  await press(root, LEGAL_ACCEPTANCE_LABEL);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useLocalSearchParams).mockReturnValue({ kind: "council" });
  mySchools = [RPI];
  createCouncil.mockResolvedValue({ id: "council-1", name: "RPI IFC" });
  selectChapter.mockResolvedValue(true);
});

afterEach(() => {
  vi.mocked(useLocalSearchParams).mockReturnValue({});
});

describe("Start a council", () => {
  it("opens on the kind of council for a founder verified at one school", async () => {
    const tree = await render();
    expect(title(tree.root)).toBe(COUNCIL_FORM_COPY.typeTitle);
    const text = screenText(tree);
    for (const label of [
      "Interfraternity Council",
      "Panhellenic Council",
      "National Pan-Hellenic Council",
      "Multicultural Greek Council",
      "Another council",
    ]) {
      expect(text).toContain(label);
    }
    // Two steps, two ticks.
    const progress = tree.root
      .findAllByType("View" as never, { deep: true })
      .find((v) => v.props.accessibilityRole === "progressbar");
    expect(progress?.props.accessibilityValue).toEqual({
      min: 1,
      max: 2,
      now: 1,
    });
  });

  it("offers the name for the school and type, and holds Create until the form is complete", async () => {
    const tree = await render();
    await press(tree.root, "Interfraternity Council");
    expect(title(tree.root)).toBe(COUNCIL_FORM_COPY.detailsTitle);
    expect(field(tree.root, COUNCIL_FORM_COPY.nameLabel)?.props.value).toBe(
      "RPI IFC",
    );
    expect(primary(tree.root).props.disabled).toBe(true);
    await pickTitle(tree.root, "VP Recruitment");
    expect(primary(tree.root).props.disabled).toBe(true);
    await press(tree.root, LEGAL_ACCEPTANCE_LABEL);
    expect(primary(tree.root).props.disabled).toBe(false);
    expect(screenText(tree)).toContain("Create RPI IFC");
  });

  it("creates the council, opens it and lands on its home", async () => {
    const tree = await render();
    await fillIfc(tree.root);
    await pressPrimary(tree.root);
    expect(createCouncil).toHaveBeenCalledWith({
      school_id: "school-rpi",
      council_type: "ifc",
      name: "RPI IFC",
      title_key: "vp_recruitment",
      accept_terms_privacy: true,
    });
    expect(selectChapter).toHaveBeenCalledWith("council-1");
    expect(vi.mocked(useRouter)().dismissTo).toHaveBeenCalledWith("/activity");
  });

  it("sends a title of the founder's own from Something else", async () => {
    const tree = await render();
    await fillIfc(tree.root, COUNCIL_FORM_COPY.somethingElse);
    expect(primary(tree.root).props.disabled).toBe(true);
    typeInto(
      tree.root,
      COUNCIL_FORM_COPY.customTitleLabel,
      "Recruitment Chair",
    );
    await settle();
    await pressPrimary(tree.root);
    expect(createCouncil).toHaveBeenCalledWith(
      expect.objectContaining({
        title_key: "custom",
        custom_title: "Recruitment Chair",
      }),
    );
  });

  it("shows the API's own sentence when the school already has that council", async () => {
    createCouncil.mockRejectedValue({
      code: "council.type_taken",
      message: "RPI already has an Interfraternity Council on Frapp.",
    });
    const tree = await render();
    await fillIfc(tree.root);
    await pressPrimary(tree.root);
    expect(screenText(tree)).toContain(
      "RPI already has an Interfraternity Council on Frapp.",
    );
    expect(selectChapter).not.toHaveBeenCalled();
    expect(vi.mocked(useRouter)().dismissTo).not.toHaveBeenCalled();
  });

  it("keeps a council whose switch failed, and opens it without making another", async () => {
    selectChapter.mockResolvedValueOnce(false);
    const tree = await render();
    await fillIfc(tree.root);
    await pressPrimary(tree.root);
    expect(screenText(tree)).toContain(COUNCIL_FORM_COPY.openFailed);
    expect(screenText(tree)).toContain("Open RPI IFC");
    await pressPrimary(tree.root);
    expect(createCouncil).toHaveBeenCalledTimes(1);
    expect(selectChapter).toHaveBeenCalledTimes(2);
    expect(vi.mocked(useRouter)().dismissTo).toHaveBeenCalledWith("/activity");
  });

  it("asks which school when the founder is verified at several", async () => {
    mySchools = [RPI, UNION];
    const tree = await render();
    expect(title(tree.root)).toBe(COUNCIL_FORM_COPY.schoolTitle);
    await press(tree.root, "Union College");
    await press(tree.root, "Panhellenic Council");
    expect(field(tree.root, COUNCIL_FORM_COPY.nameLabel)?.props.value).toBe(
      "Union Panhellenic",
    );
  });

  it("starts with the school-email check, with no skip, for a founder verified nowhere", async () => {
    mySchools = [];
    const tree = await render();
    expect(title(tree.root)).toBe("Where do you go to school?");
    expect(screenText(tree)).not.toContain("Skip for now");
    expect(control(tree.root, "Back")).toBeDefined();
  });

  it("steps back from the details to the kind of council", async () => {
    const tree = await render();
    await press(tree.root, "Interfraternity Council");
    await press(tree.root, "Back");
    expect(title(tree.root)).toBe(COUNCIL_FORM_COPY.typeTitle);
  });
});
