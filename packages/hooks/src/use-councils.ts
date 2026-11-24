"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@repo/api-sdk";
import {
  COUNCIL_SCHOOL_UNVERIFIED_CODE,
  COUNCIL_TYPE_TAKEN_CODE,
} from "@repo/validation";
import { errorCopy } from "./error-copy";
import { markLegalAcceptanceRecorded } from "./legal-acceptance";
import { useFrappClient } from "./use-frapp-client";

/** `POST /v1/councils`' body (#5933). */
export type CreateCouncilInput = components["schemas"]["CreateCouncilDto"];
/** The new council, for the switcher. */
export type CreatedCouncil = components["schemas"]["CreatedCouncilDto"];
/** The active council's own profile (`GET /v1/council`). */
export type CouncilProfile = components["schemas"]["CouncilProfileDto"];

/**
 * Starts a council at a school where the caller verified a school email
 * (`school-layer.md` § 5.3). The founder holds Council admin and the title
 * they picked; the caller then makes it their active tenant, as a new
 * chapter's founder does.
 */
export function useCreateCouncil() {
  const client = useFrappClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["councils", "create"],
    mutationFn: async (body: CreateCouncilInput) => {
      const { data, error } = await client.POST("/v1/councils", { body });
      if (error) throw error;
      return data as CreatedCouncil;
    },
    onSuccess: () => {
      // The form's checkbox is also the founder's own acceptance, as the
      // chapter wizard's is (#2302).
      markLegalAcceptanceRecorded(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["chapters"] });
    },
  });
}

/** The active council's type, model, verification and school. */
export function useCouncil(
  councilId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const client = useFrappClient();
  return useQuery({
    queryKey: ["council", councilId],
    queryFn: async ({ signal }) => {
      const { data, error } = await client.GET("/v1/council", { signal });
      if (error) throw error;
      return data as CouncilProfile;
    },
    enabled: (options?.enabled ?? true) && !!councilId,
    staleTime: 60_000,
  });
}

/**
 * What the Start a council form shows for a failed create. The two council
 * refusals carry the API's own sentence, written for members; anything else
 * goes through `errorCopy` with the form's `fallback`.
 */
export function councilStepErrorCopy(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const { code, message } = error as { code?: unknown; message?: unknown };
    if (
      (code === COUNCIL_TYPE_TAKEN_CODE ||
        code === COUNCIL_SCHOOL_UNVERIFIED_CODE) &&
      typeof message === "string" &&
      message.trim()
    ) {
      return message;
    }
  }
  return errorCopy(error, fallback);
}
