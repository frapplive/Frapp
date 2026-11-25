/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { signetDarkTokens } from "@repo/theme/signet";
import { FrappThemeProvider } from "@/lib/theme";
import { flatStyle } from "@/test/flat-style";

/**
 * s03 is what comes right after joining a chapter, for a new member and for an
 * App Reviewer alike, in up to three screens (#5627, #5284): "How the
 * chapter sees you" (always: the name, pre-filled when sign-in carried a real
 * one, and an optional photo), "About you" when phone, major, graduation year
 * or birthday is empty, then "Turn on notifications" when this build can push
 * and push is off. In a build that cannot push (#2299; `isPushAvailable()` false,
 * `spec/ui/mobile/patterns.md` § Push notifications lists the causes) there is
 * no notifications screen at all, rather than a dead "Turn on" and an apology.
 * Then chat. `lib/notifications/primer.spec.ts` covers the rules; this covers
 * the screen wiring them.
 *
 * It renders `app/(auth)/welcome.tsx` but lives here: a spec under `app/`
 * ships as a route module (`lib/routes.spec.ts`).
 */

interface Permission {
  granted: boolean;
  canAskAgain: boolean;
  status: string;
}
let pushAvailable = false;
let permission: Permission | null = null;
const OFF: Permission = {
  granted: false,
  canAskAgain: true,
  status: "undetermined",
};

vi.mock("@/lib/notifications/push", () => ({
  isPushAvailable: () => pushAvailable,
  getPushPermission: () => Promise.resolve(permission),
  isPushChannelBlocked: () => Promise.resolve(false),
  requestPushPermission: vi.fn().mockResolvedValue(true),
}));

/** `Linking` isn't in the suite's `react-native` stub; this spec adds it. */
const { openSettings } = vi.hoisted(() => ({
  openSettings: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("react-native", async () => {
  const { reactNativeStub } = await import("@/test/react-native-stub");
  return { ...reactNativeStub, Linking: { openSettings } };
});

vi.mock("@/lib/auth-session", () => ({
  useAuthSession: () => ({ status: "authenticated", chapterId: "ch-1" }),
}));

const completeOnboarding = vi.fn().mockResolvedValue(undefined);
const updateUser = vi.fn().mockResolvedValue({});
/**
 * `/v1/users/me`. A real name and a photo by default, and all four of About
 * you's fields (#5284), so a spec about another screen never meets it.
 */
const COMPLETE_USER = {
  id: "u-1",
  display_name: "Ada Lovelace",
  avatar_url: "https://example.test/ada.jpg",
  phone: "+15185550142",
  major: "Mathematics",
  graduation_year: 2027,
  birthday_month: 12,
  birthday_day: 10,
};
let currentUser: Record<string, unknown> | undefined = COMPLETE_USER;
/** `/v1/schools/mine` (#5929): verified somewhere, so no school beat. */
let mySchools: unknown[] = [{ school: { id: "s-1" } }];
/** The chapter's own fields with the member's values (#5926); none by default. */
let customFields: Record<string, unknown>[] = [];
/** Whether the fields read (and the permissions it needs) has answered. */
let customFieldsSettled = true;
const updateCustom = vi.fn();

const track = vi.fn();
vi.mock("@/lib/use-latest-track", () => ({ useLatestTrack: () => track }));

/** The school beat has its own spec; here it only has to be reached. */
vi.mock("@/components/onboarding/school-step", async () => {
  const { Pressable, Text } = await import("@/test/react-native-stub").then(
    (m) => m.reactNativeStub,
  );
  return {
    SchoolStep: (props: { initialQuery: string; onLeave: () => void }) =>
      React.createElement(
        Pressable,
        { onPress: props.onLeave },
        React.createElement(
          Text,
          null,
          `school beat: ${props.initialQuery || "none"}`,
        ),
      ),
  };
});

/** The photo control has its own spec; here it only has to be there. */
vi.mock("@/components/profile/profile-photo", () => ({
  ProfilePhoto: (props: { initials: string }) =>
    React.createElement("ProfilePhoto", props),
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useListChapters: () => ({
    data: [
      {
        chapter: {
          id: "ch-1",
          name: "FIJI Tau Nu",
          university: "Rensselaer Polytechnic Institute",
        },
      },
    ],
  }),
  useChannels: () => ({ isPending: false, isError: false, data: [] }),
  useCurrentChapter: () => ({
    data: { university: "Rensselaer Polytechnic Institute" },
  }),
  useMySchools: () => ({ data: mySchools, isFetched: true, isError: false }),
  useUpdateOnboarding: () => ({ mutateAsync: completeOnboarding }),
  useCurrentUser: () => ({
    data: currentUser,
    dataUpdatedAt: 1,
    refetch: () => Promise.resolve({ data: currentUser }),
  }),
  useUpdateUser: () => ({ mutateAsync: updateUser }),
  useOnboardingCustomFields: () => ({
    data: customFieldsSettled ? customFields : undefined,
    settled: customFieldsSettled,
    load: async () => customFields,
  }),
  useUpdateOwnCustomFields: () => ({ mutateAsync: updateCustom }),
  usePermissionList: () => ["members:view"],
  useChapterMajors: () => [],
}));

import { useRouter } from "expo-router";
import Welcome from "@/app/(auth)/welcome";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { requestPushPermission } from "@/lib/notifications/push";
import {
  PUSH_PRIMER_DECLINED_AT_KEY,
  PUSH_PRIMER_STORAGE_KEY,
} from "@/lib/notifications/primer";
import { WELCOME_DUE_STORAGE_KEY } from "@/lib/onboarding/welcome-due";

type Node = ReactTestRenderer["root"];

beforeEach(() => {
  mySchools = [{ school: { id: "s-1" } }];
});

/**
 * Renders s03. By default it also answers the name screen, keeping the name,
 * so a spec about the notifications screen starts on it.
 */
async function render({
  passYou = true,
}: { passYou?: boolean } = {}): Promise<ReactTestRenderer> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <QueryClientProvider client={queryClient}>
        <FrappThemeProvider>
          <Welcome />
        </FrappThemeProvider>
      </QueryClientProvider>,
    );
  });
  // Let the primer-decision and permission reads resolve, so the screen shows
  // what they said rather than its first frame.
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  if (passYou) await answerYou(tree.root);
  return tree;
}

const onYouScreen = (root: Node) =>
  root
    .findAllByType("Text" as never, { deep: true })
    .some((text) => text.props.children === "How the chapter sees you");

/** Moves on from the name screen, keeping the name. */
async function answerYou(root: Node) {
  if (!onYouScreen(root)) return;
  const next =
    button(root, "Continue") ?? button(root, "Go to chat") ?? undefined;
  await press(next);
}

const texts = (root: Node) =>
  root
    .findAllByType("Text" as never, { deep: true })
    .map((text) => JSON.stringify(text.props.children ?? ""));

const turnOn = (root: Node) =>
  root
    .findAllByType("Pressable" as never, { deep: true })
    .find(
      (pressable) =>
        pressable.props.accessibilityLabel === "Turn on notifications",
    );

const pressables = (root: Node) =>
  root.findAllByType("Pressable" as never, { deep: true });

/** The Pressable whose own text reads `label`. */
const button = (root: Node, label: string) =>
  pressables(root).find((pressable) =>
    pressable
      .findAllByType("Text" as never, { deep: true })
      .some((text) => text.props.children === label),
  );

async function press(target: Node | undefined) {
  await act(async () => {
    await target?.props.onPress();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

describe("s03 welcome, the school beat (#5929)", () => {
  beforeEach(() => {
    pushAvailable = false;
    permission = null;
    completeOnboarding.mockClear();
    vi.mocked(vi.mocked(useRouter)().replace).mockClear();
    mySchools = [];
  });

  const schoolBeat = (root: Node) =>
    texts(root).find((t) => t.includes("school beat"));

  it("follows the name for a member with no verified school, from the chapter's school", async () => {
    const { root } = await render();

    expect(schoolBeat(root)).toContain("Rensselaer Polytechnic Institute");
    expect(vi.mocked(useRouter)().replace).not.toHaveBeenCalled();
  });

  it("goes on to chat when the beat is left, with no primer to ask", async () => {
    const { root } = await render();

    await press(
      pressables(root).find((p) =>
        p
          .findAllByType("Text" as never, { deep: true })
          .some((t) => String(t.props.children).includes("school beat")),
      ),
    );

    expect(completeOnboarding).toHaveBeenCalledWith({
      has_completed_onboarding: true,
    });
    expect(vi.mocked(useRouter)().replace).toHaveBeenCalledWith("/");
  });

  it("goes on to notifications when there is push to ask about", async () => {
    pushAvailable = true;
    permission = OFF;
    const { root } = await render();

    await press(
      pressables(root).find((p) =>
        p
          .findAllByType("Text" as never, { deep: true })
          .some((t) => String(t.props.children).includes("school beat")),
      ),
    );

    expect(texts(root).some((t) => t.includes("Turn on notifications"))).toBe(
      true,
    );
  });

  it("asks no school of a member already verified at one", async () => {
    mySchools = [{ school: { id: "s-1" } }];
    const { root } = await render();

    expect(schoolBeat(root)).toBeUndefined();
    expect(vi.mocked(useRouter)().replace).toHaveBeenCalledWith("/");
  });
});

describe("s03 welcome, notifications step", () => {
  beforeEach(() => {
    pushAvailable = false;
    permission = null;
    completeOnboarding.mockClear();
    openSettings.mockClear();
    vi.mocked(requestPushPermission).mockClear().mockResolvedValue(true);
    vi.mocked(vi.mocked(useRouter)().replace).mockClear();
  });

  it("has no notifications step when push is unavailable", async () => {
    permission = OFF;
    const { root } = await render();

    expect(turnOn(root)).toBeUndefined();
    expect(requestPushPermission).not.toHaveBeenCalled();
    // Nothing to ask: straight to chat.
    expect(vi.mocked(useRouter)().replace).toHaveBeenCalledWith("/");
  });

  it("has no notifications step when push is already on", async () => {
    pushAvailable = true;
    permission = { granted: true, canAskAgain: true, status: "granted" };
    const { root } = await render();

    expect(turnOn(root)).toBeUndefined();
    expect(vi.mocked(useRouter)().replace).toHaveBeenCalledWith("/");
  });

  it("follows the name screen when there is push to ask about", async () => {
    pushAvailable = true;
    permission = OFF;
    const { root } = await render();

    // No "You're in." card first: the welcome card in the channel says it.
    expect(texts(root).some((t) => t.includes("in."))).toBe(false);
    // Its own title, both answers pinned under the scroll.
    expect(texts(root).some((t) => t.includes("Turn on notifications"))).toBe(
      true,
    );
    const scroll = root.findByType("ScrollView" as never);
    expect(
      scroll.findAllByType("Pressable" as never, { deep: true }),
    ).toHaveLength(0);
    expect(button(root, "Turn on notifications")).toBeDefined();
    expect(button(root, "Not now")).toBeDefined();
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("shows the OS prompt on Turn on, then goes to chat", async () => {
    pushAvailable = true;
    permission = OFF;
    const { root } = await render();

    await press(button(root, "Turn on notifications"));

    expect(requestPushPermission).toHaveBeenCalledTimes(1);
    expect(completeOnboarding).toHaveBeenCalledWith({
      has_completed_onboarding: true,
    });
    expect(vi.mocked(useRouter)().replace).toHaveBeenCalledWith("/");
  });

  it("goes to chat after a Don't Allow too", async () => {
    pushAvailable = true;
    permission = OFF;
    vi.mocked(requestPushPermission).mockResolvedValueOnce(false);
    const { root } = await render();

    await press(button(root, "Turn on notifications"));

    expect(vi.mocked(useRouter)().replace).toHaveBeenCalledWith("/");
  });

  it("goes to chat on Not now, with no OS prompt, and keeps when it was said", async () => {
    pushAvailable = true;
    permission = OFF;
    const { root } = await render();

    await press(button(root, "Not now"));

    expect(requestPushPermission).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      PUSH_PRIMER_STORAGE_KEY,
      "declined",
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      PUSH_PRIMER_DECLINED_AT_KEY,
      expect.any(String),
    );
    expect(vi.mocked(useRouter)().replace).toHaveBeenCalledWith("/");
  });

  // iOS after an earlier Don't Allow, or Android after
  // a second one: no dialog can appear, so the button says where it goes.
  it("opens the phone's settings when no prompt can appear", async () => {
    pushAvailable = true;
    permission = { granted: false, canAskAgain: false, status: "denied" };
    const { root } = await render();

    expect(button(root, "Turn on notifications")).toBeUndefined();
    await press(button(root, "Open Settings"));

    expect(requestPushPermission).not.toHaveBeenCalled();
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(vi.mocked(useRouter)().replace).toHaveBeenCalledWith("/");
  });

  it("takes Android 13+ granted-but-blocked as off", async () => {
    pushAvailable = true;
    permission = { granted: true, canAskAgain: false, status: "denied" };
    const { root } = await render();

    expect(button(root, "Open Settings")).toBeDefined();
  });
  // The decision is stored before the OS prompt and before the PATCH that
  // ends onboarding. Neither may drop the member back on an earlier beat with
  // a live Continue while the answer finishes.
  it("keeps the step, with its buttons off, while an answer finishes", async () => {
    pushAvailable = true;
    permission = OFF;
    let finishPatch!: () => void;
    completeOnboarding.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishPatch = resolve)),
    );
    const { root } = await render();

    await press(button(root, "Not now"));

    expect(completeOnboarding).toHaveBeenCalledTimes(1);
    expect(button(root, "Continue")).toBeUndefined();
    expect(button(root, "Not now")?.props.disabled).toBe(true);
    await press(button(root, "Not now"));
    expect(completeOnboarding).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishPatch();
    });
    expect(vi.mocked(useRouter)().replace).toHaveBeenCalledWith("/");
  });

  it("leaves Android back alone on the name, and walks back to it from notifications", async () => {
    const { BackHandler } = await import("react-native");
    const listen = vi.mocked(BackHandler.addEventListener);
    listen.mockClear();
    pushAvailable = true;
    permission = OFF;
    const { root } = await render({ passYou: false });

    expect(onYouScreen(root)).toBe(true);
    expect(
      listen.mock.calls.filter(([event]) => event === "hardwareBackPress"),
    ).toHaveLength(0);

    await answerYou(root);
    expect(button(root, "Not now")).toBeDefined();
    const calls = listen.mock.calls as unknown as [string, () => boolean][];
    const handler = calls.filter(([e]) => e === "hardwareBackPress").at(-1);
    act(() => {
      handler![1]();
    });
    expect(onYouScreen(root)).toBe(true);
  });
});

/**
 * One gold button on each screen of s03: Continue or Go to chat on the name,
 * Turn on notifications on the notifications screen, with Not now as a quiet
 * line.
 */
describe("s03 welcome, one gold button", () => {
  const goToChat = (root: Node) =>
    root
      .findAllByType("Pressable" as never, { deep: true })
      .find((pressable) =>
        pressable
          .findAllByType("Text" as never, { deep: true })
          .some((text) => text.props.children === "Go to chat"),
      );

  /** A Pressable's resting fill. */
  const fill = (pressable: Node | undefined): unknown =>
    flatStyle(pressable?.props.style).backgroundColor;

  beforeEach(() => {
    pushAvailable = false;
    permission = null;
    currentUser = COMPLETE_USER;
  });

  it("makes Turn on notifications the gold button on the second beat", async () => {
    pushAvailable = true;
    permission = OFF;
    const { root } = await render({ passYou: false });
    expect(fill(button(root, "Continue"))).toBe(
      signetDarkTokens.color.gold.house,
    );
    await press(button(root, "Continue"));

    expect(fill(button(root, "Turn on notifications"))).toBe(
      signetDarkTokens.color.gold.house,
    );
    expect(fill(button(root, "Not now"))).not.toBe(
      signetDarkTokens.color.gold.house,
    );
  });

  it("makes Go to chat the gold button when there is no primer", async () => {
    const { root } = await render({ passYou: false });

    expect(fill(goToChat(root))).toBe(signetDarkTokens.color.gold.house);
  });

  it("spins under the same label while it leaves, rather than renaming itself", async () => {
    completeOnboarding.mockReturnValueOnce(new Promise(() => {}));
    const { root } = await render({ passYou: false });
    act(() => {
      void goToChat(root)?.props.onPress();
    });

    const leaving = root
      .findAllByType("Pressable" as never, { deep: true })
      .find((pressable) => pressable.props.accessibilityLabel === "Go to chat");
    expect(leaving?.props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
    expect(texts(root).some((t) => t.includes("Opening chat"))).toBe(false);
  });
});

/**
 * The name screen: always the first screen of s03, before notifications. The
 * name is pre-filled when sign-in carried a real one, checked on Continue and
 * saved only when it changed; the photo is optional.
 */
describe("s03 welcome, the name screen", () => {
  const field = (root: Node) =>
    root
      .findAllByType("TextInput" as never, { deep: true })
      .find((input) => input.props.accessibilityLabel === "Your name");

  beforeEach(() => {
    pushAvailable = false;
    permission = null;
    currentUser = COMPLETE_USER;
    completeOnboarding.mockClear();
    updateUser.mockClear().mockResolvedValue({});
    track.mockClear();
    vi.mocked(vi.mocked(useRouter)().replace).mockClear();
  });

  const profileEvents = () =>
    track.mock.calls.filter(
      ([event]) => event === "onboarding-profile-answered",
    );

  it("always asks, with a real name pre-filled, and doesn't resend it", async () => {
    const { root } = await render({ passYou: false });

    expect(onYouScreen(root)).toBe(true);
    expect(root.findAllByType("ProfilePhoto" as never)).toHaveLength(1);
    expect(field(root)?.props.value).toBe("Ada Lovelace");

    await press(button(root, "Go to chat"));
    expect(updateUser).not.toHaveBeenCalled();
    expect(completeOnboarding).toHaveBeenCalledWith({
      has_completed_onboarding: true,
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      WELCOME_DUE_STORAGE_KEY,
      expect.stringMatching(/^u-1:ch-1:\d+$/),
    );
    expect(vi.mocked(useRouter)().replace).toHaveBeenCalledWith("/");
    expect(profileEvents()).toEqual([
      ["onboarding-profile-answered", { photo: "had", name_step: "kept" }],
    ]);
  });

  it("says when there was no photo before", async () => {
    currentUser = { ...COMPLETE_USER, avatar_url: null };
    const { root } = await render({ passYou: false });

    await press(button(root, "Go to chat"));
    expect(profileEvents()).toEqual([
      ["onboarding-profile-answered", { photo: "none", name_step: "kept" }],
    ]);
  });

  it("starts empty when the name is only the email before the @", async () => {
    currentUser = {
      ...COMPLETE_USER,
      display_name: "newbie.one",
      email: "newbie.one@example.com",
    };
    const { root } = await render({ passYou: false });

    expect(field(root)?.props.value).toBe("");
    await press(button(root, "Go to chat"));
    expect(
      texts(root).some((t) => t.includes("so the chapter knows who")),
    ).toBe(true);
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("never pre-fills the Member stand-in, and needs a name before moving on", async () => {
    currentUser = { ...COMPLETE_USER, display_name: "Member" };
    const { root } = await render({ passYou: false });

    expect(field(root)?.props.value).toBe("");
    await press(button(root, "Go to chat"));
    expect(
      texts(root).some((t) => t.includes("so the chapter knows who")),
    ).toBe(true);
    expect(updateUser).not.toHaveBeenCalled();
    expect(completeOnboarding).not.toHaveBeenCalled();

    act(() => field(root)?.props.onChangeText("  Grace Hopper "));
    expect(
      texts(root).some((t) => t.includes("so the chapter knows who")),
    ).toBe(false);
    await press(button(root, "Go to chat"));

    expect(updateUser).toHaveBeenCalledWith({ display_name: "Grace Hopper" });
    // Shape only: never the name itself.
    expect(profileEvents()).toEqual([
      ["onboarding-profile-answered", { photo: "had", name_step: "added" }],
    ]);
    expect(vi.mocked(useRouter)().replace).toHaveBeenCalledWith("/");
  });

  it("shows a locked name read-only and moves on without sending it (#5801)", async () => {
    currentUser = {
      ...COMPLETE_USER,
      display_name: "Member",
      display_name_locked: true,
    };
    const { root } = await render({ passYou: false });

    expect(field(root)?.props.value).toBe("Member");
    expect(field(root)?.props.editable).toBe(false);
    expect(
      texts(root).some((t) => t.includes("Your chapter's officers set names.")),
    ).toBe(true);
    await press(button(root, "Go to chat"));

    expect(updateUser).not.toHaveBeenCalled();
    expect(completeOnboarding).toHaveBeenCalledWith({
      has_completed_onboarding: true,
    });
  });

  it("stays, with the reason, when the name can't be saved", async () => {
    currentUser = { ...COMPLETE_USER, display_name: "" };
    updateUser.mockRejectedValueOnce(new Error("offline"));
    const { root } = await render({ passYou: false });
    act(() => field(root)?.props.onChangeText("Grace Hopper"));

    await press(button(root, "Go to chat"));

    expect(texts(root).some((t) => t.includes("Couldn't save your name"))).toBe(
      true,
    );
    expect(completeOnboarding).not.toHaveBeenCalled();
    expect(field(root)?.props.value).toBe("Grace Hopper");
    expect(profileEvents()).toEqual([]);
  });

  it("keeps an edited name when Android back returns to it from notifications", async () => {
    const { BackHandler } = await import("react-native");
    const listen = vi.mocked(BackHandler.addEventListener);
    listen.mockClear();
    pushAvailable = true;
    permission = OFF;
    const { root } = await render({ passYou: false });

    act(() => field(root)?.props.onChangeText("Ada King"));
    await press(button(root, "Continue"));
    expect(updateUser).toHaveBeenCalledWith({ display_name: "Ada King" });
    expect(button(root, "Not now")).toBeDefined();

    const calls = listen.mock.calls as unknown as [string, () => boolean][];
    const handler = calls.filter(([e]) => e === "hardwareBackPress").at(-1);
    act(() => {
      handler![1]();
    });
    expect(field(root)?.props.value).toBe("Ada King");
  });
});

/**
 * About you (#5284): after the name, before notifications, only when phone,
 * major, graduation year or birthday is empty. Continue saves only what
 * changed, with the Edit sheet's rules; Skip for now saves nothing.
 */
describe("s03 welcome, About you", () => {
  const NEW_MEMBER = {
    ...COMPLETE_USER,
    phone: null,
    major: null,
    graduation_year: null,
    birthday_month: null,
    birthday_day: null,
  };
  const input = (root: Node, label: string) =>
    root
      .findAllByType("TextInput" as never, { deep: true })
      .find((node) => node.props.accessibilityLabel === label);
  const onAbout = (root: Node) =>
    root
      .findAllByType("Text" as never, { deep: true })
      .some((text) => text.props.children === "About you");

  beforeEach(() => {
    pushAvailable = false;
    permission = null;
    currentUser = NEW_MEMBER;
    completeOnboarding.mockClear();
    updateUser.mockClear().mockResolvedValue({});
    vi.mocked(vi.mocked(useRouter)().replace).mockClear();
  });

  it("is skipped entirely when all four are filled in", async () => {
    currentUser = COMPLETE_USER;
    const { root } = await render();

    expect(onAbout(root)).toBe(false);
    expect(vi.mocked(useRouter)().replace).toHaveBeenCalledWith("/");
  });

  it("follows the name when one is empty, and the name says Continue", async () => {
    const { root } = await render({ passYou: false });
    expect(button(root, "Continue")).toBeDefined();

    await answerYou(root);

    expect(onAbout(root)).toBe(true);
    expect(input(root, "Phone")).toBeDefined();
    expect(input(root, "Major")).toBeDefined();
    expect(input(root, "Graduation year")).toBeDefined();
    expect(input(root, "Birthday month, 1 to 12")).toBeDefined();
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("Skip for now saves nothing and moves on", async () => {
    const { root } = await render();
    act(() => input(root, "Major")?.props.onChangeText("Physics"));

    await press(button(root, "Skip for now"));

    expect(updateUser).not.toHaveBeenCalled();
    expect(completeOnboarding).toHaveBeenCalled();
    expect(vi.mocked(useRouter)().replace).toHaveBeenCalledWith("/");
  });

  it("saves only the fields that changed", async () => {
    const { root } = await render();
    act(() => input(root, "Major")?.props.onChangeText(" Physics "));
    act(() => input(root, "Birthday month, 1 to 12")?.props.onChangeText("3"));
    act(() => input(root, "Birthday day")?.props.onChangeText("14"));

    await press(button(root, "Go to chat"));

    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(updateUser).toHaveBeenCalledWith({
      major: "Physics",
      birthday_month: 3,
      birthday_day: 14,
      birthday_year: null,
    });
    expect(vi.mocked(useRouter)().replace).toHaveBeenCalledWith("/");
  });

  it("refuses half a birthday on Continue and sends nothing", async () => {
    const { root } = await render();
    act(() => input(root, "Birthday month, 1 to 12")?.props.onChangeText("3"));

    await press(button(root, "Go to chat"));

    expect(updateUser).not.toHaveBeenCalled();
    expect(onAbout(root)).toBe(true);
    expect(
      root
        .findAllByType("Text" as never, { deep: true })
        .some((text) => text.props.accessibilityRole === "alert"),
    ).toBe(true);
  });

  it("stays, with the reason and what was typed, when the save fails", async () => {
    updateUser.mockRejectedValueOnce(new Error("offline"));
    const { root } = await render();
    act(() => input(root, "Major")?.props.onChangeText("Physics"));

    await press(button(root, "Go to chat"));

    expect(texts(root).some((t) => t.includes("Couldn't save that"))).toBe(
      true,
    );
    expect(completeOnboarding).not.toHaveBeenCalled();
    expect(input(root, "Major")?.props.value).toBe("Physics");
  });

  it("comes before notifications, and Android back returns to it", async () => {
    const { BackHandler } = await import("react-native");
    const listen = vi.mocked(BackHandler.addEventListener);
    listen.mockClear();
    pushAvailable = true;
    permission = OFF;
    const { root } = await render();
    expect(onAbout(root)).toBe(true);

    await press(button(root, "Continue"));
    expect(button(root, "Not now")).toBeDefined();

    const calls = listen.mock.calls as unknown as [string, () => boolean][];
    const handler = calls.filter(([e]) => e === "hardwareBackPress").at(-1);
    act(() => {
      handler![1]();
    });
    expect(onAbout(root)).toBe(true);
  });

  it("returns to the name on Android back from About you", async () => {
    const { BackHandler } = await import("react-native");
    const listen = vi.mocked(BackHandler.addEventListener);
    listen.mockClear();
    const { root } = await render();
    expect(onAbout(root)).toBe(true);

    const calls = listen.mock.calls as unknown as [string, () => boolean][];
    const handler = calls.filter(([e]) => e === "hardwareBackPress").at(-1);
    expect(handler).toBeDefined();
    let handled = false;
    act(() => {
      handled = handler![1]();
    });
    expect(handled).toBe(true);
    expect(onYouScreen(root)).toBe(true);
  });

  it("sends a clear made after coming back to it from notifications", async () => {
    const { BackHandler } = await import("react-native");
    const listen = vi.mocked(BackHandler.addEventListener);
    listen.mockClear();
    pushAvailable = true;
    permission = OFF;
    const { root } = await render();
    act(() => input(root, "Major")?.props.onChangeText("Physics"));
    await press(button(root, "Continue"));
    expect(updateUser).toHaveBeenLastCalledWith({ major: "Physics" });

    const calls = listen.mock.calls as unknown as [string, () => boolean][];
    act(() => {
      calls
        .filter(([e]) => e === "hardwareBackPress")
        .at(-1)![1]();
    });
    expect(input(root, "Major")?.props.value).toBe("Physics");
    act(() => input(root, "Major")?.props.onChangeText(""));
    await press(button(root, "Continue"));

    expect(updateUser).toHaveBeenLastCalledWith({ major: "" });
  });
});

/**
 * About you with the chapter's own fields (#5926): every one behind a
 * collapsed See more (Shawn, 2026-11-24); sent with Continue, never on a pick.
 */
describe("s03 welcome, About you with the chapter's fields", () => {
  const CONTACT = {
    field_id: "cf-contact",
    label: "Emergency contact (name)",
    type: "text",
    required: true,
    visibility: "exec",
    choices: null,
    max_length: null,
    value: null,
  };
  const SHIRT = {
    field_id: "cf-shirt",
    label: "T-shirt size",
    type: "select",
    required: false,
    visibility: "chapter",
    choices: ["S", "M", "L"],
    max_length: null,
    value: null,
  };
  const CONTACT_PHONE = {
    field_id: "cf-contact-phone",
    label: "Emergency contact (phone)",
    type: "phone",
    required: true,
    visibility: "exec",
    choices: null,
    max_length: null,
    value: null,
  };
  const input = (root: Node, label: string) =>
    root
      .findAllByType("TextInput" as never, { deep: true })
      .find((node) => node.props.accessibilityLabel === label);
  const onAbout = (root: Node) =>
    root
      .findAllByType("Text" as never, { deep: true })
      .some((text) => text.props.children === "About you");
  const seeMore = (root: Node) =>
    pressables(root).find(
      (pressable) => pressable.props.accessibilityLabel === "See more",
    );
  /** Renders s03 to About you and opens See more. */
  const renderOpen = async () => {
    const tree = await render();
    await press(seeMore(tree.root));
    return tree;
  };

  beforeEach(() => {
    pushAvailable = false;
    permission = null;
    currentUser = COMPLETE_USER;
    customFields = [CONTACT, CONTACT_PHONE, SHIRT];
    customFieldsSettled = true;
    completeOnboarding.mockClear();
    updateUser.mockClear().mockResolvedValue({});
    updateCustom.mockReset().mockImplementation(async () => customFields);
    vi.mocked(vi.mocked(useRouter)().replace).mockClear();
  });

  it("asks when a required field is empty, even with the profile full", async () => {
    const { root } = await render();

    expect(onAbout(root)).toBe(true);
    expect(input(root, "Phone")).toBeDefined();
  });

  it("is skipped when only optional fields are empty", async () => {
    customFields = [{ ...CONTACT, value: "Grace Hopper" }, SHIRT];
    const { root } = await render();

    expect(onAbout(root)).toBe(false);
    expect(vi.mocked(useRouter)().replace).toHaveBeenCalledWith("/");
  });

  it("keeps every one behind a collapsed See more that opens and closes", async () => {
    const { root } = await render();

    expect(input(root, "Emergency contact (name)")).toBeUndefined();
    expect(seeMore(root)).toBeDefined();

    await press(seeMore(root));

    expect(input(root, "Emergency contact (name)")).toBeDefined();
    expect(
      pressables(root).some(
        (p) => p.props.accessibilityLabel === "T-shirt size",
      ),
    ).toBe(true);
    expect(texts(root).some((t) => t.includes("Officers see this"))).toBe(true);

    act(() =>
      input(root, "Emergency contact (name)")?.props.onChangeText("Grace"),
    );
    await press(seeMore(root));
    expect(input(root, "Emergency contact (name)")).toBeUndefined();
    await press(seeMore(root));
    // What was typed stays while it is closed.
    expect(input(root, "Emergency contact (name)")?.props.value).toBe("Grace");
  });

  it("opens See more on a refusal inside it, and sends nothing", async () => {
    const { root } = await renderOpen();
    act(() =>
      input(root, "Emergency contact (phone)")?.props.onChangeText("12"),
    );
    await press(seeMore(root));

    await press(button(root, "Go to chat"));

    expect(updateCustom).not.toHaveBeenCalled();
    expect(input(root, "Emergency contact (phone)")).toBeDefined();
    expect(texts(root).some((t) => t.includes("Enter a phone number"))).toBe(
      true,
    );
  });

  it("sends only what changed on Continue, and nothing on Skip for now", async () => {
    const { root } = await renderOpen();
    act(() =>
      input(root, "Emergency contact (name)")?.props.onChangeText(" Grace "),
    );

    await press(button(root, "Go to chat"));

    expect(updateUser).not.toHaveBeenCalled();
    expect(updateCustom).toHaveBeenCalledWith([
      { field_id: "cf-contact", value: "Grace" },
    ]);
    expect(vi.mocked(useRouter)().replace).toHaveBeenCalledWith("/");
  });

  it("lets a required field wait: Go to chat with it empty sends nothing", async () => {
    const { root } = await render();

    await press(button(root, "Go to chat"));

    expect(updateCustom).not.toHaveBeenCalled();
    expect(vi.mocked(useRouter)().replace).toHaveBeenCalledWith("/");
  });

  it("Skip for now saves none of them", async () => {
    const { root } = await renderOpen();
    act(() =>
      input(root, "Emergency contact (name)")?.props.onChangeText("Grace"),
    );

    await press(button(root, "Skip for now"));

    expect(updateCustom).not.toHaveBeenCalled();
    expect(completeOnboarding).toHaveBeenCalled();
  });

  it("refuses a phone the API would, and sends nothing", async () => {
    const { root } = await renderOpen();
    act(() =>
      input(root, "Emergency contact (phone)")?.props.onChangeText("12"),
    );

    await press(button(root, "Go to chat"));

    expect(updateCustom).not.toHaveBeenCalled();
    expect(onAbout(root)).toBe(true);
    expect(texts(root).some((t) => t.includes("Enter a phone number"))).toBe(
      true,
    );
  });

  it("draws nothing while the fields read is still out, then decides with it", async () => {
    customFieldsSettled = false;
    const { root } = await render({ passYou: false });

    // Still deciding: the name's button would only know the profile.
    expect(
      root.findAll((n) => n.props.testID === "welcome-deciding").length,
    ).toBeGreaterThan(0);
  });

  it("waits for the fields on leaving the name, so a required one isn't missed", async () => {
    customFieldsSettled = false;
    const { root } = await render({ passYou: false });
    // Past the 4-second give-up, the screen draws without the fields.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 4_100));
    });

    await answerYou(root);

    expect(onAbout(root)).toBe(true);
    await press(seeMore(root));
    expect(input(root, "Emergency contact (name)")).toBeDefined();
  }, 10_000);

  it("shows the server's refusal, not the connection line", async () => {
    updateCustom.mockRejectedValueOnce({
      statusCode: 400,
      message: "Pick one of the choices for T-shirt size.",
    });
    const { root } = await renderOpen();
    act(() =>
      input(root, "Emergency contact (name)")?.props.onChangeText("Grace"),
    );

    await press(button(root, "Go to chat"));

    expect(
      texts(root).some((t) =>
        t.includes("Pick one of the choices for T-shirt size."),
      ),
    ).toBe(true);
  });

  it("doesn't resend the profile when only the fields failed", async () => {
    currentUser = { ...COMPLETE_USER, major: null };
    updateCustom.mockRejectedValueOnce(new Error("offline"));
    const { root } = await renderOpen();
    act(() => input(root, "Major")?.props.onChangeText("Physics"));
    act(() =>
      input(root, "Emergency contact (name)")?.props.onChangeText("Grace"),
    );

    await press(button(root, "Go to chat"));
    await press(button(root, "Go to chat"));

    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(updateCustom).toHaveBeenCalledTimes(2);
    expect(vi.mocked(useRouter)().replace).toHaveBeenCalledWith("/");
  });

  it("stays with the reason when the fields can't be saved", async () => {
    updateCustom.mockRejectedValueOnce(new Error("offline"));
    const { root } = await renderOpen();
    act(() =>
      input(root, "Emergency contact (name)")?.props.onChangeText("Grace"),
    );

    await press(button(root, "Go to chat"));

    expect(texts(root).some((t) => t.includes("Couldn't save that"))).toBe(
      true,
    );
    expect(completeOnboarding).not.toHaveBeenCalled();
    expect(input(root, "Emergency contact (name)")?.props.value).toBe("Grace");
  });
});
