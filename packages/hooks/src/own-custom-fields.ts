"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@repo/api-sdk";
import { useActiveChapterId, useFrappClient } from "./use-frapp-client";

/**
 * Your own custom-field values (#581): the chapter's fields (T-shirt size,
 * allergies, an emergency contact) with what you set for each, read and
 * written on web `/profile` and the phone's You tab. Every tier comes back,
 * since a member always reads their own; `visibility` is who else sees it.
 */
export type OwnCustomField = components["schemas"]["OwnCustomFieldDto"];
export type OwnCustomFieldValue =
  components["schemas"]["OwnCustomFieldValueDto"];

/** Its own root, so a directory invalidation doesn't refetch it. */
const ownCustomFieldsKey = (chapterId: string | null) =>
  ["own-custom-fields", chapterId] as const;

export function useOwnCustomFields(options: { enabled?: boolean } = {}) {
  const client = useFrappClient();
  const chapterId = useActiveChapterId();
  return useQuery({
    queryKey: ownCustomFieldsKey(chapterId),
    queryFn: async ({ signal }) => {
      const { data, error } = await client.GET("/v1/members/me/custom-fields", {
        signal,
      });
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
    enabled: !!chapterId && (options.enabled ?? true),
  });
}

/**
 * Save some of your values; fields left out keep theirs. One refused value
 * refuses the save (400 with the field's message). The answer is all your
 * fields, which goes straight into the cache, and the directory's reads of
 * you refetch so your profile there shows the new values.
 */
export function useUpdateOwnCustomFields() {
  const client = useFrappClient();
  const queryClient = useQueryClient();
  const chapterId = useActiveChapterId();
  return useMutation({
    mutationKey: ["own-custom-fields", "update"],
    mutationFn: async (values: OwnCustomFieldValue[]) => {
      const { data, error } = await client.PATCH(
        "/v1/members/me/custom-fields",
        { body: { values } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(ownCustomFieldsKey(chapterId), saved);
      void queryClient.invalidateQueries({ queryKey: ["members", chapterId] });
    },
  });
}
