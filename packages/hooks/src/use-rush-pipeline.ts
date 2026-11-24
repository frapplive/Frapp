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
export type RushContact = components["schemas"]["RushContactDto"];
export type RushContactKind = RushContact["kind"];
export type RushSettings = components["schemas"]["RushSettingsDto"];
export type RushManualClosedReason = NonNullable<
  components["schemas"]["MoveRushCandidateStageDto"]["closed_reason"]
>;

export const rushPipelineKeys = {
  pipeline: (chapterId: string | null) =>
    ["rush", chapterId, "pipeline"] as const,
  notes: (chapterId: string | null, candidateId: string) =>
    ["rush", chapterId, "notes", candidateId] as const,
  contacts: (chapterId: string | null, candidateId: string) =>
    ["rush", chapterId, "contacts", candidateId] as const,
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

function useRushInvalidate() {
  const queryClient = useQueryClient();
  const chapterId = useActiveChapterId();
  return () =>
    queryClient.invalidateQueries({
      queryKey: rushPipelineKeys.pipeline(chapterId),
    });
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

/**
 * Tag or untag a prospect (`rush:notes`). Each change is worked out from the
 * cached list at the moment it's asked for, and the cache takes it at once,
 * so a second tap made before the first one's write returns builds on it
 * rather than on what was last drawn. The writes run one at a time (one
 * mutation scope), and the pipeline is read again only once the last of
 * them settles, so an earlier write's read can't put back a list a later
 * tap already changed. The route replaces the whole list, so running the
 * writes in order also keeps one from undoing another on the server.
 */
export function useSetRushCandidateTags() {
  const client = useFrappClient();
  const queryClient = useQueryClient();
  const chapterId = useActiveChapterId();
  const invalidate = useRushInvalidate();
  const mutation = useMutation({
    mutationKey: ["rush", "set-tags"],
    scope: { id: "rush-set-tags" },
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
    onSettled: () => {
      // This mutation still counts as running here.
      if (queryClient.isMutating({ mutationKey: ["rush", "set-tags"] }) <= 1) {
        void invalidate();
      }
    },
  });
  const change = (
    input: {
      candidateId: string;
      add?: string;
      remove?: string;
      /** Adds the tag if the cached list lacks it, else removes it. */
      toggle?: string;
    },
    options?: { onError?: (error: unknown) => void },
  ) => {
    const key = rushPipelineKeys.pipeline(chapterId);
    const pipeline = queryClient.getQueryData<RushPipeline>(key);
    const current = pipeline?.candidates.find(
      (candidate) => candidate.id === input.candidateId,
    );
    if (!pipeline || !current) return;
    if (input.toggle) {
      input = current.tag_ids.includes(input.toggle)
        ? { ...input, remove: input.toggle }
        : { ...input, add: input.toggle };
    }
    let tagIds = current.tag_ids.filter((id) => id !== input.remove);
    if (input.add && !tagIds.includes(input.add)) {
      tagIds = [...tagIds, input.add];
    }
    void queryClient.cancelQueries({ queryKey: key });
    queryClient.setQueryData<RushPipeline>(key, {
      ...pipeline,
      candidates: pipeline.candidates.map((candidate) =>
        candidate.id === input.candidateId
          ? { ...candidate, tag_ids: tagIds }
          : candidate,
      ),
    });
    mutation.mutate(
      { candidateId: input.candidateId, tagIds },
      { onError: options?.onError },
    );
  };
  return { change, isPending: mutation.isPending };
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

// ── Contacts, owner, follow-ups and settings (#5934) ─────────────────────────

/** A prospect's logged contacts, newest first (`rush:view`). */
export function useRushContacts(
  candidateId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const client = useFrappClient();
  const chapterId = useActiveChapterId();
  return useQuery({
    queryKey: rushPipelineKeys.contacts(chapterId, candidateId ?? ""),
    queryFn: async ({ signal }) => {
      const { data, error } = await client.GET(
        "/v1/rush/candidates/{id}/contacts",
        { signal, params: { path: { id: candidateId! } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: (options?.enabled ?? true) && !!chapterId && !!candidateId,
  });
}

/**
 * Log a contact (`rush:add`). The prospect's last contact and cleared
 * follow-up show at once; the pipeline is read again for the rest (a first
 * contact also moves a New prospect to Contacted on the server).
 */
export function useLogRushContact() {
  const client = useFrappClient();
  const queryClient = useQueryClient();
  const chapterId = useActiveChapterId();
  const invalidate = useRushInvalidate();
  const optimistic = useOptimisticCandidate();
  return useMutation({
    mutationKey: ["rush", "log-contact"],
    mutationFn: async (input: {
      candidateId: string;
      kind: RushContactKind;
      contactedOn: string;
      note?: string;
      /** The logger's name, for the optimistic "by …". */
      byName?: string;
    }) => {
      const { data, error } = await client.POST(
        "/v1/rush/candidates/{id}/contacts",
        {
          params: { path: { id: input.candidateId } },
          body: {
            kind: input.kind,
            contacted_on: input.contactedOn,
            ...(input.note?.trim() ? { note: input.note.trim() } : {}),
          },
        },
      );
      if (error) throw error;
      return data;
    },
    onMutate: (input) =>
      optimistic(input.candidateId, (candidate) => ({
        ...candidate,
        ...(!candidate.last_contact_on ||
        candidate.last_contact_on <= input.contactedOn
          ? {
              last_contact_on: input.contactedOn,
              last_contact_by_name:
                input.byName ?? candidate.last_contact_by_name,
            }
          : {}),
        follow_up_on: null,
        follow_up_note: null,
        follow_up_user_id: null,
        follow_up_user_name: null,
      })),
    onError: (_error, _input, rollback) => rollback?.(),
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({
        queryKey: rushPipelineKeys.contacts(chapterId, input.candidateId),
      });
      return invalidate();
    },
  });
}

/**
 * Set or clear a prospect's owner. Claiming an unowned prospect or letting go
 * of your own needs `rush:add`; anything else needs `rush:manage`. A 409
 * means someone else claimed them first.
 */
export function useSetRushOwner() {
  const client = useFrappClient();
  const invalidate = useRushInvalidate();
  const optimistic = useOptimisticCandidate();
  return useMutation({
    mutationKey: ["rush", "set-owner"],
    mutationFn: async (input: {
      candidateId: string;
      ownerId: string | null;
      /** The new owner's name, for the optimistic row. */
      ownerName?: string | null;
    }) => {
      const { data, error } = await client.PUT(
        "/v1/rush/candidates/{id}/owner",
        {
          params: { path: { id: input.candidateId } },
          body: { owner_id: input.ownerId },
        },
      );
      if (error) throw error;
      return data;
    },
    onMutate: (input) =>
      optimistic(input.candidateId, (candidate) => ({
        ...candidate,
        owner_id: input.ownerId,
        owner_name: input.ownerId ? (input.ownerName ?? null) : null,
      })),
    onError: (_error, _input, rollback) => rollback?.(),
    onSettled: invalidate,
  });
}

/**
 * Set a prospect's follow-up (`rush:add`): a day, what to do, and who it's
 * for, the owner by default.
 */
export function useSetRushFollowUp() {
  const client = useFrappClient();
  const invalidate = useRushInvalidate();
  const optimistic = useOptimisticCandidate();
  return useMutation({
    mutationKey: ["rush", "set-follow-up"],
    mutationFn: async (input: {
      candidateId: string;
      dueOn: string;
      note?: string;
      forUserId?: string;
    }) => {
      const { data, error } = await client.PUT(
        "/v1/rush/candidates/{id}/follow-up",
        {
          params: { path: { id: input.candidateId } },
          body: {
            due_on: input.dueOn,
            ...(input.note?.trim() ? { note: input.note.trim() } : {}),
            ...(input.forUserId ? { for_user_id: input.forUserId } : {}),
          },
        },
      );
      if (error) throw error;
      return data;
    },
    onMutate: (input) =>
      optimistic(input.candidateId, (candidate) => ({
        ...candidate,
        follow_up_on: input.dueOn,
        follow_up_note: input.note?.trim() || null,
      })),
    onError: (_error, _input, rollback) => rollback?.(),
    onSettled: invalidate,
  });
}

/** Clear a prospect's follow-up (`rush:add`). */
export function useClearRushFollowUp() {
  const client = useFrappClient();
  const invalidate = useRushInvalidate();
  const optimistic = useOptimisticCandidate();
  return useMutation({
    mutationKey: ["rush", "clear-follow-up"],
    mutationFn: async (candidateId: string) => {
      const { data, error } = await client.DELETE(
        "/v1/rush/candidates/{id}/follow-up",
        { params: { path: { id: candidateId } } },
      );
      if (error) throw error;
      return data;
    },
    onMutate: (candidateId) =>
      optimistic(candidateId, (candidate) => ({
        ...candidate,
        follow_up_on: null,
        follow_up_note: null,
        follow_up_user_id: null,
        follow_up_user_name: null,
      })),
    onError: (_error, _candidateId, rollback) => rollback?.(),
    onSettled: invalidate,
  });
}

/**
 * Save the chapter's stale days (`rush:manage`). The pipeline carries the
 * value (`stale_days`), so it is the one read refreshed.
 */
export function useSaveRushSettings() {
  const client = useFrappClient();
  const invalidate = useRushInvalidate();
  return useMutation({
    mutationKey: ["rush", "save-settings"],
    mutationFn: async (settings: RushSettings) => {
      const { data, error } = await client.PUT("/v1/rush/settings", {
        body: settings,
      });
      if (error) throw error;
      return data;
    },
    onSettled: invalidate,
  });
}
