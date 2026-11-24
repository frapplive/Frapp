"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@repo/api-sdk";
import { errorCopy } from "./error-copy";
import { useActiveChapterId, useFrappClient } from "./use-frapp-client";

/**
 * A chapter's interest form (#5977, `spec/behavior/ifc-recruitment.md`
 * § Chapter interest forms): its settings on the Recruitment module page,
 * web and the phone alike, a candidate's form answers, and the public page
 * at `/f/<form-slug>`, which needs no account.
 */

export type InterestFormSettings =
  components["schemas"]["InterestFormSettingsDto"];
export type InterestFormQuestion =
  components["schemas"]["InterestFormQuestionDto"];
export type InterestFormUpdate = components["schemas"]["UpdateInterestFormDto"];
export type PublicInterestForm = components["schemas"]["PublicInterestFormDto"];
export type InterestFormVerified =
  components["schemas"]["InterestFormVerifiedDto"];
export type InterestFormSubmission =
  components["schemas"]["SubmitInterestFormDto"];
export type CandidateFormSubmission =
  components["schemas"]["CandidateFormSubmissionDto"];

export const interestFormKeys = {
  settings: (chapterId: string | null) =>
    ["interest-form", chapterId, "settings"] as const,
  candidate: (chapterId: string | null, candidateId: string) =>
    ["interest-form", chapterId, "candidate", candidateId] as const,
  public: (slug: string, src: string | null) =>
    ["interest-form", "public", slug, src] as const,
};

/** The form's settings; the first read writes the form, closed. */
export function useInterestFormSettings(options?: { enabled?: boolean }) {
  const client = useFrappClient();
  const chapterId = useActiveChapterId();
  return useQuery({
    queryKey: interestFormKeys.settings(chapterId),
    queryFn: async ({ signal }) => {
      const { data, error } = await client.GET("/v1/rush/interest-form", {
        signal,
      });
      if (error) throw error;
      return data;
    },
    enabled: (options?.enabled ?? true) && !!chapterId,
  });
}

/**
 * Every settings write answers the whole settings view, which replaces the
 * cached one, so a switch, the blurb and the QR list stay in step.
 */
function useSettingsWrite<V>(
  key: string,
  write: (
    client: ReturnType<typeof useFrappClient>,
    value: V,
  ) => Promise<InterestFormSettings>,
) {
  const client = useFrappClient();
  const chapterId = useActiveChapterId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["interest-form", key],
    mutationFn: (value: V) => write(client, value),
    onSuccess: (settings) => {
      queryClient.setQueryData(interestFormKeys.settings(chapterId), settings);
    },
  });
}

/** Open or close, blurb, questions, the referrer question, contacts. */
export function useUpdateInterestForm() {
  return useSettingsWrite<InterestFormUpdate>(
    "update",
    async (client, body) => {
      const { data, error } = await client.PATCH("/v1/rush/interest-form", {
        body,
      });
      if (error) throw error;
      return data;
    },
  );
}

export function useAddInterestFormLabel() {
  return useSettingsWrite<string>("add-label", async (client, label) => {
    const { data, error } = await client.POST("/v1/rush/interest-form/labels", {
      body: { label },
    });
    if (error) throw error;
    return data;
  });
}

export function useRemoveInterestFormLabel() {
  return useSettingsWrite<string>("remove-label", async (client, labelId) => {
    const { data, error } = await client.DELETE(
      "/v1/rush/interest-form/labels/{labelId}",
      { params: { path: { labelId } } },
    );
    if (error) throw error;
    return data;
  });
}

/** A new link; the old link and every printed QR code stop working. */
export function useReplaceInterestForm() {
  return useSettingsWrite<void>("replace", async (client) => {
    const { data, error } = await client.POST("/v1/rush/interest-form/replace");
    if (error) throw error;
    return data;
  });
}

/** A candidate's newest form submission (`rush:view`), or null. */
export function useCandidateForm(
  candidateId: string | null,
  options?: { enabled?: boolean },
) {
  const client = useFrappClient();
  const chapterId = useActiveChapterId();
  return useQuery({
    queryKey: interestFormKeys.candidate(chapterId, candidateId ?? ""),
    queryFn: async ({ signal }) => {
      const { data, error } = await client.GET(
        "/v1/rush/candidates/{id}/form",
        { params: { path: { id: candidateId ?? "" } }, signal },
      );
      if (error) throw error;
      return data.submission;
    },
    enabled: (options?.enabled ?? true) && !!chapterId && !!candidateId,
  });
}

// The public page -------------------------------------------------------------

/** The form's public fields, with no account. */
export function usePublicInterestForm(slug: string, src: string | null) {
  const client = useFrappClient();
  return useQuery({
    queryKey: interestFormKeys.public(slug, src),
    queryFn: async ({ signal }) => {
      const { data, error } = await client.GET("/v1/interest-forms/{slug}", {
        params: { path: { slug }, query: src ? { src } : {} },
        signal,
      });
      if (error) throw error;
      return data;
    },
    retry: false,
  });
}

export function useStartInterestFormCode(slug: string) {
  const client = useFrappClient();
  return useMutation({
    mutationKey: ["interest-form", "code", slug],
    mutationFn: async (email: string) => {
      const { data, error } = await client.POST(
        "/v1/interest-forms/{slug}/code",
        { params: { path: { slug } }, body: { email } },
      );
      if (error) throw error;
      return data;
    },
  });
}

export function useVerifyInterestFormCode(slug: string) {
  const client = useFrappClient();
  return useMutation({
    mutationKey: ["interest-form", "verify", slug],
    mutationFn: async (body: { email: string; code: string }) => {
      const { data, error } = await client.POST(
        "/v1/interest-forms/{slug}/verify",
        { params: { path: { slug } }, body },
      );
      if (error) throw error;
      return data;
    },
  });
}

export function useSubmitInterestForm(slug: string) {
  const client = useFrappClient();
  return useMutation({
    mutationKey: ["interest-form", "submit", slug],
    mutationFn: async (body: InterestFormSubmission) => {
      const { data, error } = await client.POST(
        "/v1/interest-forms/{slug}/submissions",
        { params: { path: { slug } }, body },
      );
      if (error) throw error;
      return data;
    },
  });
}

/**
 * What the form shows for a failed call. Every `interest_form.*` refusal's
 * message is one of `@repo/validation`'s interest-form sentences, written for
 * a PNM, so it is shown as sent; anything else goes through `errorCopy`, the
 * one map from a failed call to what a person reads, as the school step's
 * `schoolStepErrorCopy` does.
 */
export function interestFormErrorCopy(
  error: unknown,
  fallback: string,
): string {
  if (error && typeof error === "object") {
    const { code, message } = error as { code?: unknown; message?: unknown };
    if (
      typeof code === "string" &&
      code.startsWith("interest_form.") &&
      typeof message === "string" &&
      message.trim()
    ) {
      return message;
    }
  }
  return errorCopy(error, fallback);
}
