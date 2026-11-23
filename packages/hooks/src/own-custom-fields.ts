"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@repo/api-sdk";
import { formatPhone } from "@repo/formatting";
import { ownCustomFieldChanges } from "@repo/validation";
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

/**
 * What a form shows for a stored value, the text it starts from: a phone
 * formatted as every screen shows it, the rest as stored. One rule for both
 * apps' forms.
 */
export function ownCustomFieldShownValue(field: OwnCustomField): string {
  if (field.value === null) return "";
  return field.type === "phone" ? formatPhone(field.value) : field.value;
}

/**
 * Whether a pick offers "Not set": always, except on a required field that
 * already has a value, which can't go back to empty.
 */
export function ownCustomFieldOffersNotSet(field: OwnCustomField): boolean {
  return !(field.required && field.value !== null);
}

/**
 * What a save sends from a form's draft: only the fields whose text differs
 * from what the form showed ({@link ownCustomFieldShownValue}), each checked
 * by type, with each refused field's message.
 */
export function ownCustomFieldFormChanges(
  fields: readonly OwnCustomField[],
  draft: Readonly<Record<string, string>>,
) {
  return ownCustomFieldChanges(fields, draft, (field) =>
    ownCustomFieldShownValue(field as OwnCustomField),
  );
}

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
 * fields, which goes into the cache of the chapter the save was sent for,
 * captured when it is sent: TanStack hands a running mutation the latest
 * render's options, so a chapter switched mid-save would otherwise get
 * another chapter's fields. Your profile and search reads in that chapter,
 * the ones that carry custom-field values, refetch.
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
    onMutate: () => ({ sentFor: chapterId }),
    onSuccess: (saved, _values, context) => {
      const sentFor = context?.sentFor ?? null;
      if (!sentFor) return;
      queryClient.setQueryData(ownCustomFieldsKey(sentFor), saved);
      for (const read of ["by-user", "search"]) {
        void queryClient.invalidateQueries({
          queryKey: ["members", sentFor, read],
        });
      }
    },
  });
}
