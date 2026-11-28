import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";

/*
 * The chapter the member is in, and moving between theirs (#5946). Ported from
 * `chapter-nav-header.spec.tsx`, deleted with the chapter menu atop the nav
 * when the name became a label and switching moved into the member's menu.
 * The switching contract is the same one that suite pinned.
 */

// A successful switch replaces the document; jsdom's real location.assign
// throws "not implemented", so stand in for it and assert the destination.
const assign = vi.fn();
Object.defineProperty(window, "location", {
  value: { ...window.location, assign },
  writable: true,
});

const { selectChapter, toast, chaptersQuery, currentChapterQuery } = vi.hoisted(
  () => ({
    selectChapter: vi.fn(async () => true),
    toast: vi.fn(),
    chaptersQuery: {
      current: { data: [] as unknown[], isSuccess: true },
    },
    currentChapterQuery: {
      current: {
        data: undefined as unknown,
        isError: false,
        isLoading: false,
      },
    },
  }),
);

vi.mock("@repo/hooks", () => ({
  useAccessibleChapters: () => chaptersQuery.current,
  useCurrentChapter: () => currentChapterQuery.current,
}));
vi.mock("@/lib/auth/select-chapter", () => ({
  useSelectChapter: () => selectChapter,
}));
vi.mock("@/lib/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

let keptChapter: { name?: string; logo_url?: string | null } | null = null;
vi.mock("@/lib/shell-cache/shell-cache-sync", () => ({
  useShellCached: () => keptChapter,
}));

let activeChapterId: string | null = "chap-1";
vi.mock("@/lib/stores/chapter-store", () => ({
  useChapterStore: (
    selector: (s: { activeChapterId: string | null }) => unknown,
  ) => selector({ activeChapterId }),
}));

const bulkDropNotice = vi.fn((): string | null => null);
vi.mock("@/lib/backwork-bulk/session", () => ({
  bulkDropNotice: () => bulkDropNotice(),
}));

import { ChapterLabel, useChapterSwitcher } from "./chapter-switcher";
import { useHolidayFlairOn } from "@/components/chat/holiday-flair";

function membership(id: string, name: string) {
  return { chapter_id: id, chapter: { id, name, university: "Test U" } };
}

function Label({ collapsed = false }: { collapsed?: boolean }) {
  const switcher = useChapterSwitcher();
  return (
    <>
      <ChapterLabel switcher={switcher} collapsed={collapsed} />
      {switcher.dialog}
    </>
  );
}

describe("the chapter label and switching (#5946)", () => {
  beforeEach(() => {
    selectChapter.mockClear();
    selectChapter.mockResolvedValue(true);
    bulkDropNotice.mockReturnValue(null);
    assign.mockClear();
    toast.mockClear();
    activeChapterId = "chap-1";
    chaptersQuery.current = {
      data: [membership("chap-1", "Alpha"), membership("chap-2", "Beta")],
      isSuccess: true,
    };
    currentChapterQuery.current = {
      data: { id: "chap-1", name: "Alpha Chapter", university: "Test U" },
      isError: false,
      isLoading: false,
    };
    keptChapter = null;
  });

  it("draws the chapter's name as a label, not a control", () => {
    render(<Label />);
    expect(screen.getByText("Alpha Chapter")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("tips a Santa hat onto the crest in the Holiday season (#6149)", () => {
    const { unmount } = render(<Label />);
    expect(screen.queryByTestId("holiday-santa-hat")).toBeNull();
    unmount();
    vi.mocked(useHolidayFlairOn).mockReturnValue(true);
    try {
      render(<Label />);
      expect(screen.getByTestId("holiday-santa-hat")).toBeInTheDocument();
    } finally {
      vi.mocked(useHolidayFlairOn).mockReturnValue(false);
    }
  });

  it("offers only the other chapters to switch to", () => {
    const { result } = renderHook(() => useChapterSwitcher());
    expect(result.current.otherChapters.map((m) => m.chapter_id)).toEqual([
      "chap-2",
    ]);
  });

  it("switches through useSelectChapter, then reloads into the dashboard", async () => {
    const { result } = renderHook(() => useChapterSwitcher());
    act(() => result.current.select("chap-2"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
    expect(selectChapter).toHaveBeenCalledWith("chap-2");
  });

  it("does nothing for the chapter the member is already in", async () => {
    const { result } = renderHook(() => useChapterSwitcher());
    act(() => result.current.select("chap-1"));
    await Promise.resolve();
    expect(selectChapter).not.toHaveBeenCalled();
  });

  it("stays put and says so when the switch fails", async () => {
    selectChapter.mockResolvedValue(false);
    const { result } = renderHook(() => useChapterSwitcher());
    act(() => result.current.select("chap-2"));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Couldn't switch chapter" }),
      ),
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it("asks before a switch drops Bulk upload documents, and stays put on Cancel", async () => {
    bulkDropNotice.mockReturnValue("3 documents are still uploading.");
    render(<Label />);
    const { result } = renderHook(() => useChapterSwitcher());
    act(() => result.current.select("chap-2"));
    // The hook's own dialog is rendered by whoever holds the switcher; here,
    // the confirm never resolves to yes, so nothing switches.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(selectChapter).not.toHaveBeenCalled();
  });

  it("gives a member stranded on a chapter they left a way out, even in the rail", async () => {
    activeChapterId = "gone";
    render(<Label collapsed />);
    expect(screen.getByText("Chapter unavailable")).toBeInTheDocument();
    const alpha = screen.getByRole("button", { name: "Alpha" });
    act(() => alpha.click());
    await waitFor(() => expect(selectChapter).toHaveBeenCalledWith("chap-1"));
  });

  it("says a chapter couldn't be read rather than drawing an empty label", () => {
    currentChapterQuery.current = {
      data: undefined,
      isError: true,
      isLoading: false,
    };
    render(<Label />);
    expect(screen.getByText("Chapter unavailable")).toBeInTheDocument();
  });

  it("draws the kept chapter while its read is out (#5049)", () => {
    keptChapter = { name: "Kept Chapter", logo_url: null };
    currentChapterQuery.current = {
      data: undefined,
      isError: false,
      isLoading: true,
    };
    render(<Label />);
    expect(screen.getByText("Kept Chapter")).toBeInTheDocument();
  });

  it("drops the kept chapter once its read has failed", () => {
    keptChapter = { name: "Kept Chapter", logo_url: null };
    currentChapterQuery.current = {
      data: undefined,
      isError: true,
      isLoading: false,
    };
    render(<Label />);
    expect(screen.queryByText("Kept Chapter")).toBeNull();
    expect(screen.getByText("Chapter unavailable")).toBeInTheDocument();
  });

  // jsdom has no layout, so the guard is the class: the head row doesn't
  // centre, so a label only as wide as its crest sat 5px left of the icons
  // under it (Paul, 2026-11-24).
  it("fills the rail's head so the crest centres on the icons", () => {
    const { container } = render(<Label collapsed />);
    const label = container.querySelector("[data-chapter-label]");
    expect(label).toHaveClass("flex-1", "justify-center");
  });
});
