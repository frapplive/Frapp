"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@repo/api-sdk";
import { useActiveChapterId, useFrappClient } from "./use-frapp-client";

/**
 * The recruitment pipeline's reads and writes (#5924), for web's Rush page,
 * the phone's Rush screens and the Recruitment settings page. Every write
 * refreshes the one pipeline read, so a board, a prospect panel and a chat
 * card left open all catch up.
 */

export type RushPipeline = components["schemas"]["RushPipelineDto"];
export type RushPipelineCandidate =
  components["schemas"]["RushPipelineCandidateDto"];
export type RushStage = components["schemas"]["RushStageDto"];
export type RushStageInput = components["schemas"]["RushStageInputDto"];
export type RushTag = components["schemas"]["RushTagDto"];
export type RushNote = components["schemas"]["RushNoteDto"];
export type RushManualClosedReason = NonNullable<
  components["schemas"]["MoveRushCandidateStageDto"]["closed_reason"]
>;

export const rushPipelineKeys = {
  pipeline: (chapterId: string | null) =>
    ["rush", chapterId, "pipeline"] as const,
  stages: (chapterId: string | null) => ["rush", chapterId, "stages"] as const,
  notes: (chapterId: string | null, candidateId: string) =>
    ["rush", chapterId, "notes", candidateId] as const,
};

/** Stages, tags and every prospect, for the board, the list and the phone. */
export function useRushPipeline(options?: { enabled?: boolean }) {
  const client = useFrappClient();
  const chapterId = useActiveChapterId();
  return useQuery({
    queryKey: rushPipelineKeys.pipeline(chapterId),
    queryFn: async ({ signal }) => {
      const { data, error } = await client.GET("/v1/rush/pipeline", {
        signal,
      });
      if (error) throw error;
      return data;
    },
    enabled: (options?.enabled ?? true) && !!chapterId,
  });
}

/** The chapter's stages alone, for the settings page's stage editor. */
export function useRushStages(options?: { enabled?: boolean }) {
  const client = useFrappClient();
  const chapterId = useActiveChapterId();
  return useQuery({
    queryKey: rushPipelineKeys.stages(chapterId),
    queryFn: async ({ signal }) => {
      const { data, error } = await client.GET("/v1/rush/stages", { signal });
      if (error) throw error;
      return data;
    },
    enabled: (options?.enabled ?? true) && !!chapterId,
  });
}

function useRushInvalidate() {
  const queryClient = useQueryClient();
  const chapterId = useActiveChapterId();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: rushPipelineKeys.pipeline(chapterId),
      }),
      queryClient.invalidateQueries({
        queryKey: rushPipelineKeys.stages(chapterId),
      }),
    ]);
}

/**
 * Add a prospect by name (`POST /v1/rush/candidates`, `rush:add`), the same
 * write `/<vocab> add` sends from chat, without the chat card. A 409 means
 * the chapter already has that name.
 */
export function useAddRushProspect() {
  const client = useFrappClient();
  const invalidate = useRushInvalidate();
  return useMutation({
    mutationKey: ["rush", "add-prospect"],
    mutationFn: async (displayName: string) => {
      const { data, error } = await client.POST("/v1/rush/candidates", {
        body: { display_name: displayName },
      });
      if (error) throw error;
      return data;
    },
    onSettled: invalidate,
  });
}

/** Save the whole stage list, in order (`rush:manage`). */
export function useSaveRushStages() {
  const client = useFrappClient();
  const invalidate = useRushInvalidate();
  return useMutation({
    mutationKey: ["rush", "save-stages"],
    mutationFn: async (stages: RushStageInput[]) => {
      const { data, error } = await client.PUT("/v1/rush/stages", {
        body: { stages },
      });
      if (error) throw error;
      return data;
    },
    onSettled: invalidate,
  });
}

/**
 * Patch one prospect in the cached pipeline, for an optimistic write; the
 * returned function puts the old pipeline back.
 */
function useOptimisticCandidate() {
  const queryClient = useQueryClient();
  const chapterId = useActiveChapterId();
  return async (
    candidateId: string,
    patch: (candidate: RushPipelineCandidate) => RushPipelineCandidate,
  ) => {
    const key = rushPipelineKeys.pipeline(chapterId);
    await queryClient.cancelQueries({ queryKey: key });
    const previous = queryClient.getQueryData<RushPipeline>(key);
    if (previous) {
      queryClient.setQueryData<RushPipeline>(key, {
        ...previous,
        candidates: previous.candidates.map((candidate) =>
          candidate.id === candidateId ? patch(candidate) : candidate,
        ),
      });
    }
    return () => {
      if (previous) queryClient.setQueryData(key, previous);
    };
  };
}

/**
 * Move a prospect to a stage (`rush:add`). A Closed stage needs a reason.
 * The board moves the card at once and puts it back if the server refuses.
 */
export function useMoveRushStage() {
  const client = useFrappClient();
  const invalidate = useRushInvalidate();
  const optimistic = useOptimisticCandidate();
  return useMutation({
    mutationKey: ["rush", "move-stage"],
    mutationFn: async (input: {
      candidateId: string;
      stage: string;
      closedReason?: RushManualClosedReason;
    }) => {
      const { data, error } = await client.PATCH(
        "/v1/rush/candidates/{id}/stage",
        {
          params: { path: { id: input.candidateId } },
          body: {
            stage: input.stage,
            ...(input.closedReason
              ? { closed_reason: input.closedReason }
              : {}),
          },
        },
      );
      if (error) throw error;
      return data;
    },
    onMutate: (input) =>
      optimistic(input.candidateId, (candidate) => ({
        ...candidate,
        stage: input.stage,
        closed_reason: input.closedReason ?? null,
      })),
    onError: (_error, _input, rollback) => rollback?.(),
    onSettled: invalidate,
  });
}

/** Replace a prospect's tags (`rush:notes`). */
export function useSetRushCandidateTags() {
  const client = useFrappClient();
  const invalidate = useRushInvalidate();
  const optimistic = useOptimisticCandidate();
  return useMutation({
    mutationKey: ["rush", "set-tags"],
    mutationFn: async (input: { candidateId: string; tagIds: string[] }) => {
      const { data, error } = await client.PUT(
        "/v1/rush/candidates/{id}/tags",
        {
          params: { path: { id: input.candidateId } },
          body: { tag_ids: input.tagIds },
        },
      );
      if (error) throw error;
      return data;
    },
    onMutate: (input) =>
      optimistic(input.candidateId, (candidate) => ({
        ...candidate,
        tag_ids: input.tagIds,
      })),
    onError: (_error, _input, rollback) => rollback?.(),
    onSettled: invalidate,
  });
}

/** Set the viewer's own 1-to-5 rating (`rush:vote`). */
export function useRateRushCandidate() {
  const client = useFrappClient();
  const invalidate = useRushInvalidate();
  const optimistic = useOptimisticCandidate();
  return useMutation({
    mutationKey: ["rush", "rate"],
    mutationFn: async (input: { candidateId: string; rating: number }) => {
      const { error } = await client.PUT("/v1/rush/candidates/{id}/rating", {
        params: { path: { id: input.candidateId } },
        body: { rating: input.rating },
      });
      if (error) throw error;
    },
    onMutate: (input) =>
      optimistic(input.candidateId, (candidate) => ({
        ...candidate,
        viewer_rating: input.rating,
      })),
    onError: (_error, _input, rollback) => rollback?.(),
    onSettled: invalidate,
  });
}

/** Add a tag to the chapter's list (`rush:manage`). */
export function useCreateRushTag() {
  const client = useFrappClient();
  const invalidate = useRushInvalidate();
  return useMutation({
    mutationKey: ["rush", "create-tag"],
    mutationFn: async (label: string) => {
      const { data, error } = await client.POST("/v1/rush/tags", {
        body: { label },
      });
      if (error) throw error;
      return data;
    },
    onSettled: invalidate,
  });
}

/** Rename a tag (`rush:manage`). */
export function useRenameRushTag() {
  const client = useFrappClient();
  const invalidate = useRushInvalidate();
  return useMutation({
    mutationKey: ["rush", "rename-tag"],
    mutationFn: async (input: { tagId: string; label: string }) => {
      const { data, error } = await client.PATCH("/v1/rush/tags/{tagId}", {
        params: { path: { tagId: input.tagId } },
        body: { label: input.label },
      });
      if (error) throw error;
      return data;
    },
    onSettled: invalidate,
  });
}

/** Delete a tag, taking it off every prospect (`rush:manage`). */
export function useDeleteRushTag() {
  const client = useFrappClient();
  const invalidate = useRushInvalidate();
  return useMutation({
    mutationKey: ["rush", "delete-tag"],
    mutationFn: async (tagId: string) => {
      const { error } = await client.DELETE("/v1/rush/tags/{tagId}", {
        params: { path: { tagId } },
      });
      if (error) throw error;
    },
    onSettled: invalidate,
  });
}

/**
 * A prospect's notes, newest first. Pass `enabled: false` without
 * `rush:read_notes`, or for a prospect linked to the viewer's own account:
 * the server answers those with a 403 and an empty list.
 */
export function useRushNotes(
  candidateId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const client = useFrappClient();
  const chapterId = useActiveChapterId();
  return useQuery({
    queryKey: rushPipelineKeys.notes(chapterId, candidateId ?? ""),
    queryFn: async ({ signal }) => {
      const { data, error } = await client.GET(
        "/v1/rush/candidates/{id}/notes",
        { signal, params: { path: { id: candidateId! } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: (options?.enabled ?? true) && !!chapterId && !!candidateId,
  });
}

function useNotesInvalidate() {
  const queryClient = useQueryClient();
  const chapterId = useActiveChapterId();
  return (candidateId: string) =>
    queryClient.invalidateQueries({
      queryKey: rushPipelineKeys.notes(chapterId, candidateId),
    });
}

/** Write a note (`rush:notes`). */
export function useAddRushNote() {
  const client = useFrappClient();
  const invalidate = useNotesInvalidate();
  return useMutation({
    mutationKey: ["rush", "add-note"],
    mutationFn: async (input: { candidateId: string; body: string }) => {
      const { data, error } = await client.POST(
        "/v1/rush/candidates/{id}/notes",
        {
          params: { path: { id: input.candidateId } },
          body: { body: input.body },
        },
      );
      if (error) throw error;
      return data;
    },
    onSettled: (_data, _error, input) => invalidate(input.candidateId),
  });
}

/** Edit your own note. */
export function useEditRushNote() {
  const client = useFrappClient();
  const invalidate = useNotesInvalidate();
  return useMutation({
    mutationKey: ["rush", "edit-note"],
    mutationFn: async (input: {
      candidateId: string;
      noteId: string;
      body: string;
    }) => {
      const { data, error } = await client.PATCH(
        "/v1/rush/candidates/{id}/notes/{noteId}",
        {
          params: { path: { id: input.candidateId, noteId: input.noteId } },
          body: { body: input.body },
        },
      );
      if (error) throw error;
      return data;
    },
    onSettled: (_data, _error, input) => invalidate(input.candidateId),
  });
}

/** Delete your own note, or any with `rush:manage`. */
export function useDeleteRushNote() {
  const client = useFrappClient();
  const invalidate = useNotesInvalidate();
  return useMutation({
    mutationKey: ["rush", "delete-note"],
    mutationFn: async (input: { candidateId: string; noteId: string }) => {
      const { error } = await client.DELETE(
        "/v1/rush/candidates/{id}/notes/{noteId}",
        { params: { path: { id: input.candidateId, noteId: input.noteId } } },
      );
      if (error) throw error;
    },
    onSettled: (_data, _error, input) => invalidate(input.candidateId),
  });
}
