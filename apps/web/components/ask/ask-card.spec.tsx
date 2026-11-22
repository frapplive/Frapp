import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ASK_COPY, ASK_STARTER, askSavedLine } from "@repo/validation";

/**
 * The Ask conversation's own rules: consent before the first question
 * leaves, the saved notice shown before a question may be kept (#4315), and
 * where it is drawn: a page beside chat (Paul's pick of 2026-11-22).
 */

const state = vi.hoisted(() => ({
  ask: vi.fn(),
  retry: vi.fn(),
  stop: vi.fn(),
  reset: vi.fn(),
  refetchStatus: vi.fn(),
  exchanges: [] as unknown[],
  savedUntil: null as string | null,
  consent: vi.fn(),
  permissions: ["ai:use", "ai:act"],
  actions: null as string[] | null,
  suggestions: [] as Array<{ kind: string; text: string; request: boolean }>,
  suggestionsEnabled: [] as boolean[],
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useViewerUserId: () => "me",
  useViewerDisplayName: () => "Marcus Ellison",
  useAsk: () => ({
    exchanges: state.exchanges,
    working: state.exchanges.some(
      (exchange) => (exchange as { phase: string }).phase === "working",
    ),
    ask: state.ask,
    retry: state.retry,
    setProposal: vi.fn(),
    resolveProposal: vi.fn(),
    stop: state.stop,
    reset: state.reset,
  }),
  useActStatus: () => ({ data: state.actions }),
  useAskSuggestions: (options?: { enabled?: boolean }) => {
    state.suggestionsEnabled.push(options?.enabled ?? true);
    return { suggestions: state.suggestions };
  },
  useActEventAudience: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMyPermissions: () => ({ data: { permissions: state.permissions } }),
  useAskStatus: () => ({
    refetch: state.refetchStatus,
    data: {
      saved_until: state.savedUntil,
      diagnostics: {
        offered: false,
        can_change: false,
        ends_at: state.savedUntil,
      },
    },
  }),
}));

vi.mock("@/components/ai/meet-frapp-ai", () => ({
  useAiConsentGate: () => ({
    ensureConsent: state.consent,
    consentDialog: null,
  }),
}));

const { AskConversation } = await import("./ask-card");

/** The conversation as the Ask page renders it. */
function Card() {
  return <AskConversation />;
}

const open = () => render(<Card />);

/** Opened, once the opening has read this browser's record and drawn. */
async function openSettled() {
  const view = open();
  await screen.findByText(/^Good (morning|afternoon|evening)|^Hey /);
  return view;
}

const DONE = {
  id: "turn-1",
  question: "When is the budget vote?",
  phase: "done",
  step: null,
  preview: "",
  failure: null,
  proposal: null,
  resolution: null,
  answer: {
    status: "answered",
    reason: null,
    text: "The budget vote is in the minutes.",
    citations: [],
    sources: [
      {
        id: "s1",
        kind: "meeting_minutes",
        title: "Chapter meeting",
        detail: null,
        date: "2026-11-09T00:00:00.000Z",
        target: { type: "meeting", meeting_id: "m1" },
      },
    ],
    left_out_messages: 0,
    unverified_citations: 0,
    truncated: false,
    saved: false,
  },
};

/** What a question is sent with, for a member Frapp cannot act for. */
const sent = (over: Record<string, unknown> = {}) => ({
  savedNoticeShown: false,
  actions: false,
  gate: state.consent,
  ...over,
});

/** The record that says this member has seen Ask's first-open starter. */
const STARTER_SEEN = "frapp.web.ask-starter-seen:me";

describe("AskConversation", () => {
  beforeEach(() => {
    state.ask.mockReset().mockResolvedValue(undefined);
    state.retry.mockReset().mockResolvedValue(undefined);
    state.stop.mockReset();
    state.reset.mockReset();
    state.refetchStatus.mockReset();
    state.consent.mockReset().mockResolvedValue(true);
    state.exchanges = [];
    state.savedUntil = null;
    // Every open but the first-open spec's is a later one (#4904).
    window.localStorage.setItem(STARTER_SEEN, "act");
    state.permissions = ["ai:use"];
    state.actions = null;
    state.suggestions = [];
    state.suggestionsEnabled = [];
  });

  it("sends what was typed on Enter, behind the consent gate, and clears the field", async () => {
    open();
    const field = screen.getByRole("textbox", { name: ASK_COPY.placeholder });
    await userEvent.setup().type(field, "Who is the treasurer?{Enter}");
    // The gate is the hook's to run: the question is on screen first, and
    // nothing leaves for a member who says no (`use-ask.spec.tsx`).
    expect(state.ask).toHaveBeenCalledWith("Who is the treasurer?", sent());
    expect(field).toHaveValue("");
  });

  describe("what it opens with (#4700)", () => {
    const EVENT = {
      kind: "event",
      text: "When and where is Formal on Friday?",
      request: false,
    };
    const REQUEST = {
      kind: "request",
      text: "Make a task for me to get ready for Sunday's event, due Saturday",
      request: true,
    };

    it("offers what the server built from the member's own account, and no preset", async () => {
      state.suggestions = [EVENT];
      await openSettled();
      expect(
        screen.getAllByRole("button").map((button) => button.textContent),
      ).toContain(EVENT.text);
      // Nothing but the server's list is ever offered.
      expect(screen.getAllByRole("listitem")).toHaveLength(1);
    });

    it("opens plain for a member with nothing to ask about: the crest, the greeting and the field (#4904)", async () => {
      await openSettled();
      expect(
        screen.getByText(/^Good (morning|afternoon|evening), Marcus\.$/),
      ).toBeInTheDocument();
      expect(screen.queryByText("Ask about your chapter")).toBeNull();
      expect(screen.queryByText(ASK_STARTER.answer)).toBeNull();
      expect(screen.queryByRole("list")).toBeNull();
      expect(
        screen.getByRole("textbox", { name: ASK_COPY.placeholder }),
      ).toBeInTheDocument();
    });

    it("opens a member's first time on the exchange that says what Frapp can do, once", async () => {
      window.localStorage.removeItem(STARTER_SEEN);
      const view = render(<Card />);
      expect(
        await screen.findByText("Hey Marcus, I'm Frapp."),
      ).toBeInTheDocument();
      expect(screen.getByText(ASK_STARTER.question)).toBeInTheDocument();
      expect(screen.getByText(ASK_STARTER.answer)).toBeInTheDocument();
      expect(screen.queryByText(ASK_STARTER.answer_act)).toBeNull();
      expect(state.ask).not.toHaveBeenCalled();
      // Recorded once drawn, as seen without the line about acting.
      await waitFor(() =>
        expect(window.localStorage.getItem(STARTER_SEEN)).toBe("ask"),
      );
      // Leaving the page and coming back.
      view.unmount();
      render(<Card />);
      expect(
        await screen.findByText(/^Good (morning|afternoon|evening), Marcus\.$/),
      ).toBeInTheDocument();
      expect(screen.queryByText(ASK_STARTER.answer)).toBeNull();
    });

    it("draws nothing of the opening while this browser's record is read, so the greeting never flashes first", () => {
      window.localStorage.removeItem(STARTER_SEEN);
      open();
      expect(
        screen.queryByText(/^Good (morning|afternoon|evening)/),
      ).toBeNull();
      expect(screen.queryByText("Hey Marcus, I'm Frapp.")).toBeNull();
    });

    it("sends a tapped question as a suggestion, never as words the member typed", async () => {
      state.permissions = ["ai:use", "ai:act"];
      state.suggestions = [EVENT, REQUEST];
      await openSettled();
      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: EVENT.text }));
      expect(state.ask).toHaveBeenCalledWith(
        EVENT.text,
        sent({ actions: true, suggested: true }),
      );
    });

    it("sends the one request like typed words, so it comes back as a card", async () => {
      state.permissions = ["ai:use", "ai:act"];
      state.suggestions = [EVENT, REQUEST];
      await openSettled();
      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: REQUEST.text }));
      expect(state.ask).toHaveBeenCalledWith(
        REQUEST.text,
        sent({ actions: true, suggested: false }),
      );
    });
  });

  it("opens on the newest words of the thread, not at its start (Paul, 2026-11-22)", () => {
    state.exchanges = [DONE, { ...DONE, id: "turn-2" }];
    // jsdom lays nothing out: each turn's words are 600px tall and the
    // view shows 300px, so the end is the second turn's last line.
    const height = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockReturnValue(600);
    const client = vi
      .spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockReturnValue(300);
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const top = this.closest("[data-ask-turn='turn-2']") ? 600 : 0;
        return {
          top,
          bottom: top,
          left: 0,
          right: 0,
          width: 0,
          height: 0,
          x: 0,
          y: top,
          toJSON: () => ({}),
        };
      });
    try {
      open();
      const view = document.querySelector<HTMLElement>(
        "[data-ask-thread-view]",
      );
      // 600 down, 600 tall, less the 300 shown, plus the 16px pad.
      expect(view?.scrollTop).toBe(916);
    } finally {
      height.mockRestore();
      client.mockRestore();
      rect.mockRestore();
    }
  });

  it("reads whether answers are being saved again each time it opens", () => {
    const view = open();
    expect(state.refetchStatus).toHaveBeenCalledTimes(1);
    view.unmount();
    open();
    expect(state.refetchStatus).toHaveBeenCalledTimes(2);
  });

  it("shows the saved line while answers are kept, and only then says it was shown", async () => {
    state.savedUntil = "2026-11-26T12:00:00.000Z";
    open();
    expect(
      screen.getByText(askSavedLine("November 26, 2026")),
    ).toBeInTheDocument();
    await userEvent
      .setup()
      .type(
        screen.getByRole("textbox", { name: ASK_COPY.placeholder }),
        "Who is the treasurer?{Enter}",
      );
    expect(state.ask).toHaveBeenCalledWith(
      "Who is the treasurer?",
      sent({ savedNoticeShown: true }),
    );
  });

  it("says nothing under the field, and nothing about saving when nothing is kept", () => {
    open();
    expect(screen.queryByText(/answered on its own/)).toBeNull();
    expect(screen.queryByText(/saved for the Frapp team/)).toBeNull();
  });

  it("takes no second question while one is being answered", async () => {
    state.exchanges = [
      { ...DONE, phase: "working", step: "searching", answer: null },
    ];
    open();
    await userEvent
      .setup()
      .type(
        screen.getByRole("textbox", { name: ASK_COPY.placeholder }),
        "Second?{Enter}",
      );
    expect(state.ask).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: ASK_COPY.send })).toBeDisabled();
  });

  describe("one conversation", () => {
    const SECOND = {
      ...DONE,
      id: "turn-2",
      question: "And who ran it?",
      answer: { ...DONE.answer, text: "Dana Reyes ran it.", sources: [] },
    };

    it("keeps every turn on screen, in order, with the field still under them", () => {
      state.exchanges = [DONE, SECOND];
      state.suggestions = [
        {
          kind: "event",
          text: "When and where is Formal on Friday?",
          request: false,
        },
      ];
      open();
      const turns = screen.getAllByRole("article");
      expect(turns).toHaveLength(2);
      expect(turns[0]).toHaveTextContent("When is the budget vote?");
      expect(turns[1]).toHaveTextContent("Dana Reyes ran it.");
      expect(
        screen.getByRole("textbox", { name: ASK_COPY.placeholder }),
      ).toBeInTheDocument();
      // Suggestions are for an empty thread.
      expect(
        screen.queryByRole("button", {
          name: "When and where is Formal on Friday?",
        }),
      ).toBeNull();
    });

    it("starts a new conversation from the header, and offers that only once there is one", async () => {
      const view = open();
      expect(
        screen.queryByRole("button", { name: ASK_COPY.new_conversation }),
      ).toBeNull();
      view.unmount();
      state.exchanges = [DONE];
      open();
      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: ASK_COPY.new_conversation }));
      expect(state.reset).toHaveBeenCalledTimes(1);
    });

    it("retries a failed turn in place, with what a question is sent with", async () => {
      state.exchanges = [
        {
          ...DONE,
          phase: "failed",
          answer: null,
          failure: { message: ASK_COPY.failed, retryable: true },
        },
      ];
      open();
      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: ASK_COPY.try_again }));
      expect(state.retry).toHaveBeenCalledWith("turn-1", sent());
    });

    it("holds Try again on an earlier turn while another is being answered: asking again would drop it", () => {
      state.exchanges = [
        {
          ...DONE,
          phase: "failed",
          answer: null,
          failure: { message: ASK_COPY.failed, retryable: true },
        },
        { ...DONE, id: "turn-2", phase: "working", answer: null },
      ];
      open();
      expect(
        screen
          .getByRole("button", { name: ASK_COPY.try_again })
          .hasAttribute("disabled"),
      ).toBe(true);
    });

    it("opens the AI sheet again from a turn that was refused for it", async () => {
      state.exchanges = [
        {
          ...DONE,
          answer: {
            ...DONE.answer,
            status: "unavailable",
            reason: "consent_required",
            text: "",
            sources: [],
          },
        },
      ];
      open();
      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: ASK_COPY.consent_action }));
      expect(state.retry).toHaveBeenCalledWith("turn-1", sent());
    });
  });

  describe("a page beside chat (Paul's pick of 2026-11-22)", () => {
    it("is no dialog and dims nothing: the app stays usable around it", () => {
      open();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.querySelector("[data-state=open]")).toBeNull();
    });

    it("keeps the thread and the field to one centred 720px reading column", () => {
      state.exchanges = [DONE];
      open();
      const thread = screen.getByRole("article").closest(".max-w-\\[720px\\]");
      expect(thread).not.toBeNull();
      expect(thread).toHaveClass("mx-auto");
      const field = screen.getByRole("textbox", { name: ASK_COPY.placeholder });
      expect(field.closest(".max-w-\\[720px\\]")).not.toBeNull();
    });

    it("starts with the cursor in the field, marked so the Ask bar can hand it focus", () => {
      open();
      const field = screen.getByRole("textbox", { name: ASK_COPY.placeholder });
      expect(field).toHaveFocus();
      expect(field).toHaveAttribute("data-ask-field");
    });

    it("hosts a form docked from an answer, over the page", () => {
      open();
      expect(document.querySelector("[data-panel-host]")).not.toBeNull();
    });

    it("goes on answering a question when the member leaves the page, and keeps every turn", () => {
      state.exchanges = [
        DONE,
        { ...DONE, id: "turn-2", phase: "working", answer: null },
      ];
      const view = open();
      view.unmount();
      expect(state.stop).not.toHaveBeenCalled();
      expect(state.reset).not.toHaveBeenCalled();
    });

    it("leaves a link in the thread an ordinary link: following it is leaving the page, not starting over", async () => {
      state.exchanges = [DONE];
      open();
      const source = screen.getByRole("link", { name: /Chapter meeting/ });
      source.addEventListener("click", (event) => event.preventDefault());
      await userEvent.setup().click(source);
      expect(state.reset).not.toHaveBeenCalled();
      expect(state.stop).not.toHaveBeenCalled();
    });
  });
});

describe("a member Frapp can act for (#718)", () => {
  beforeEach(() => {
    state.ask.mockReset().mockResolvedValue(undefined);
    state.exchanges = [];
    state.savedUntil = null;
    window.localStorage.setItem(STARTER_SEEN, "act");
    state.permissions = ["ai:use", "ai:act"];
    state.actions = null;
    state.suggestions = [];
  });

  it("has no Ask and Do switch, whoever the member is: one field takes both", () => {
    state.actions = ["give_points", "create_task"];
    open();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("says Frapp can do things for them, and sends what they type as something that may end in a card", async () => {
    state.actions = ["create_task", "give_points"];
    window.localStorage.removeItem(STARTER_SEEN);
    open();
    expect(await screen.findByText(ASK_STARTER.answer_act)).toBeDefined();
    await userEvent
      .setup()
      .type(
        screen.getByRole("textbox", { name: ASK_COPY.placeholder }),
        "Give Jordan 5 points{Enter}",
      );
    expect(state.ask).toHaveBeenCalledWith(
      "Give Jordan 5 points",
      sent({ actions: true }),
    );
  });

  it("asks for a card on the permission alone: a request typed before the list of actions has loaded, or with none to list, is still read as one", async () => {
    for (const actions of [null, [] as string[]]) {
      state.ask.mockClear();
      state.actions = actions;
      const view = open();
      // The list only words the opening.
      expect(screen.queryByText(ASK_STARTER.answer_act)).toBeNull();
      await userEvent
        .setup()
        .type(
          screen.getByRole("textbox", { name: ASK_COPY.placeholder }),
          "Give Jordan 5 points{Enter}",
        );
      expect(state.ask).toHaveBeenCalledWith(
        "Give Jordan 5 points",
        sent({ actions: true }),
      );
      view.unmount();
    }
  });

  it("answers only, for a member who does not hold the permission", async () => {
    state.permissions = ["ai:use"];
    open();
    expect(screen.queryByText(ASK_STARTER.answer_act)).toBeNull();
    await userEvent
      .setup()
      .type(
        screen.getByRole("textbox", { name: ASK_COPY.placeholder }),
        "Give Jordan 5 points{Enter}",
      );
    expect(state.ask).toHaveBeenCalledWith("Give Jordan 5 points", sent());
  });
});
