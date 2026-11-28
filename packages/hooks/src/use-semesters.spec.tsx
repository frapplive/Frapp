import { QueryClient } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSemesterRollover } from "./use-semesters";
import { createHookWrapper } from "./test-utils";

function createWrapper(queryClient: QueryClient, mockClient: unknown) {
  return createHookWrapper({
    client: mockClient,
    queryClient,
    chapterId: "chapter-1",
    displayName: "SemesterRolloverWrapper",
  });
}

describe("useSemesterRollover", () => {
  it("re-reads points, whose semester window starts at the archive it writes", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const POST = vi
      .fn()
      .mockResolvedValue({ data: { id: "a-1" }, error: null });
    const { result } = renderHook(() => useSemesterRollover(), {
      wrapper: createWrapper(queryClient, { POST }),
    });

    await act(async () => {
      await result.current.mutateAsync({
        label: "Fall 2026",
        start_date: "2026-08-25",
        end_date: "2026-12-18",
      });
    });

    for (const queryKey of [
      ["semesters"],
      ["chapters"],
      ["members"],
      ["points"],
    ]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey });
    }
  });

  it("settles only once the archives are read again (#6028)", async () => {
    // Chapter settings' Semester page goes back to its list when the
    // rollover's promise settles, so the list must already be the new one.
    const queryClient = new QueryClient();
    let reread!: () => void;
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation((filters) =>
      (filters as { queryKey: string[] }).queryKey[0] === "semesters"
        ? new Promise<void>((resolve) => (reread = resolve))
        : Promise.resolve(),
    );
    const POST = vi
      .fn()
      .mockResolvedValue({ data: { id: "a-1" }, error: null });
    const { result } = renderHook(() => useSemesterRollover(), {
      wrapper: createWrapper(queryClient, { POST }),
    });

    let settled = false;
    let done!: Promise<unknown>;
    act(() => {
      done = result.current
        .mutateAsync({
          label: "Fall 2026",
          start_date: "2026-08-25",
          end_date: "2026-12-18",
        })
        .then(() => (settled = true));
    });
    await vi.waitFor(() => expect(reread).toBeTypeOf("function"));
    await Promise.resolve();
    expect(settled).toBe(false);
    await act(async () => {
      reread();
      await done;
    });
    expect(settled).toBe(true);
  });
});
