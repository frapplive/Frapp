"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@repo/api-sdk";
import { formatPhone } from "@repo/formatting";
import { can, ownCustomFieldChanges } from "@repo/validation";
import { useActiveChapterId, useFrappClient } from "./use-frapp-client";
import { useMyPermissions } from "./use-user";

/**
 * Your own custom-field values (#581): the chapter's fields (T-shirt size,
 * allergies, an emergency contact) with what you set for each, read and
 * written on web `/profile` and the phone's You tab, and on About you after a
 * join (#5926, `useOnboardingCustomFields`). Every tier comes back,
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

/** A form's starting draft: each field's shown value, by field id. */
export function ownCustomFieldDraft(
  fields: readonly OwnCustomField[],
): Record<string, string> {
  return Object.fromEntries(
    fields.map((field) => [field.field_id, ownCustomFieldShownValue(field)]),
  );
}

/**
 * The value a typed field reads once the member leaves it: a phone formatted
 * as every screen shows it ((518) 555-0142), the rest as typed.
 */
export function ownCustomFieldTidied(
  field: Pick<OwnCustomField, "type">,
  typed: string,
): string {
  return field.type === "phone" && typed ? formatPhone(typed) : typed;
}

/** A per-field record without one field's entry; the same record when absent. */
export function withoutField<T>(
  record: Record<string, T>,
  fieldId: string,
): Record<string, T> {
  if (!(fieldId in record)) return record;
  const rest = { ...record };
  delete rest[fieldId];
  return rest;
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

/**
 * The chapter's fields for About you after a join (#5926), on web `/welcome`
 * and the phone's s03. The read needs `members:view`, and right after a join
 * the new chapter's permissions are rarely cached yet, so a permission list
 * still loading is "not known", never "can't read" (`settled`); and `load`
 * waits for both reads before the step decides, so a slow read can't skip
 * About you for a member whose only gap is a required field.
 *
 * `load` answers `[]` when the member can't read the fields or a read fails,
 * and gives up after `timeoutMs` with whatever is loaded, so a hung request
 * never holds the member on the name.
 */
export function useOnboardingCustomFields() {
  const permissions = useMyPermissions();
  const canView = can("members:view", permissions.data?.permissions ?? []);
  const fields = useOwnCustomFields({ enabled: canView });
  const settled =
    (permissions.isFetched || permissions.isError) &&
    (!canView || fields.isFetched || fields.isError);
  const { refetch: refetchPermissions, data: permissionData } = permissions;
  const { refetch: refetchFields, data: fieldData } = fields;
  const load = useCallback(
    async (timeoutMs = 4_000): Promise<OwnCustomField[]> => {
      const read = async () => {
        const known =
          permissionData ?? (await refetchPermissions()).data ?? null;
        if (!can("members:view", known?.permissions ?? [])) return [];
        return fieldData ?? (await refetchFields()).data ?? [];
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const gaveUp = new Promise<OwnCustomField[]>((resolve) => {
        timer = setTimeout(() => resolve(fieldData ?? []), timeoutMs);
      });
      try {
        return await Promise.race([read().catch(() => []), gaveUp]);
      } finally {
        clearTimeout(timer);
      }
    },
    [permissionData, fieldData, refetchPermissions, refetchFields],
  );
  return { data: fieldData, settled, load };
}
