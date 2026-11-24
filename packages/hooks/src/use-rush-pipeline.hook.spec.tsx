import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createHookWrapper, createTestQueryClient } from "./test-utils";
import {
  rushPipelineKeys,
  useSetRushCandidateTags,
  type RushPipeline,
} from "./use-rush-pipeline";

const CHAPTER = "chapter-1";

function pipeline(tagIds: string[]): RushPipeline {
  return {
    stages: [],
    tags: [],
    candidates: [
      {
        id: "cand-1",
        display_name: "Jane",
        user_id: null,
        stage: "new",
        closed_reason: null,
        bid_status: "none",
        created_by: "u",
        created_by_name: "U",
        created_at: "",
        tag_ids: tagIds,
        viewer_rating: null,
        viewer_has_voted: false,
        owner_id: null,
        owner_name: null,
        last_contact_on: null,
        last_contact_by: null,
        last_contact_by_name: null,
        follow_up_on: null,
        follow_up_note: null,
        follow_up_user_id: null,
        follow_up_user_name: null,
      },
    ],
    stale_days: 7,
  };
}

/**
 * Tag writes (#5924): each tap builds on the cache, not on what was last
 * drawn, and the writes run one at a time, so quick taps on the phone's
 * multi-pick sheet can't lose a tag.
 */
describe("useSetRushCandidateTags", () => {
  it("builds a second quick tap on the first, and sends the writes in order", async () => {
    const resolvers: Array<() => void> = [];
    const PUT = vi.fn(
      () =>
        new Promise((resolve) => {
          resolvers.push(() => resolve({ data: { tag_ids: [] } }));
        }),
    );
    const GET = vi.fn().mockResolvedValue({ data: pipeline(["a", "b"]) });
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(rushPipelineKeys.pipeline(CHAPTER), pipeline([]));
    const wrapper = createHookWrapper({
      client: { PUT, GET },
      queryClient,
      chapterId: CHAPTER,
    });
    const { result } = renderHook(() => useSetRushCandidateTags(), {
      wrapper,
    });

    act(() => {
      result.current.change({ candidateId: "cand-1", toggle: "a" });
      result.current.change({ candidateId: "cand-1", toggle: "b" });
    });

    expect(
      queryClient.getQueryData<RushPipeline>(rushPipelineKeys.pipeline(CHAPTER))
        ?.candidates[0]?.tag_ids,
    ).toEqual(["a", "b"]);
    // The second write waits for the first.
    await waitFor(() => expect(PUT).toHaveBeenCalledTimes(1));
    expect(PUT).toHaveBeenLastCalledWith(
      "/v1/rush/candidates/{id}/tags",
      expect.objectContaining({ body: { tag_ids: ["a"] } }),
    );
    resolvers[0]!();
    await waitFor(() => expect(PUT).toHaveBeenCalledTimes(2));
    expect(PUT).toHaveBeenLastCalledWith(
      "/v1/rush/candidates/{id}/tags",
      expect.objectContaining({ body: { tag_ids: ["a", "b"] } }),
    );
    // Nothing is read back while a later write is still out.
    expect(GET).not.toHaveBeenCalled();
    resolvers[1]!();
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });

  it("untags with a second toggle of the same tag", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(
      rushPipelineKeys.pipeline(CHAPTER),
      pipeline(["a"]),
    );
    const PUT = vi.fn(() => new Promise(() => undefined));
    const wrapper = createHookWrapper({
      client: { PUT, GET: vi.fn() },
      queryClient,
      chapterId: CHAPTER,
    });
    const { result } = renderHook(() => useSetRushCandidateTags(), {
      wrapper,
    });
    act(() => result.current.change({ candidateId: "cand-1", toggle: "a" }));
    expect(
      queryClient.getQueryData<RushPipeline>(rushPipelineKeys.pipeline(CHAPTER))
        ?.candidates[0]?.tag_ids,
    ).toEqual([]);
  });
});
