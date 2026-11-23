"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@repo/api-sdk";
import { useFrappClient } from "./use-frapp-client";

/** A school as search and the caller's own list show it (#5929). */
export type SchoolSummary = components["schemas"]["SchoolSummaryDto"];
/** One of the caller's schools: where they proved a school address. */
export type MySchool = components["schemas"]["MySchoolDto"];
/** A code that went out. */
export type SentSchoolCode = components["schemas"]["SentSchoolCodeDto"];

/** Fewer characters than this asks nothing (the API answers `[]` too). */
export const SCHOOL_SEARCH_MIN_LENGTH = 2;

const MINE_KEY = ["schools", "mine"] as const;

/** Schools by name, short name or another name, best match first. */
export function useSchoolSearch(
  query: string,
  options?: { enabled?: boolean },
) {
  const client = useFrappClient();
  const q = query.trim();
  return useQuery({
    queryKey: ["schools", "search", q],
    queryFn: async ({ signal }) => {
      const { data, error } = await client.GET("/v1/schools", {
        signal,
        params: { query: { q } },
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: (options?.enabled ?? true) && q.length >= SCHOOL_SEARCH_MIN_LENGTH,
    staleTime: 60_000,
  });
}

/** The caller's verified schools; empty for someone who hasn't verified. */
export function useMySchools(options?: { enabled?: boolean }) {
  const client = useFrappClient();
  return useQuery({
    queryKey: MINE_KEY,
    queryFn: async ({ signal }) => {
      const { data, error } = await client.GET("/v1/schools/mine", { signal });
      if (error) throw error;
      return data ?? [];
    },
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
  });
}

/** Emails a six-digit code to the caller's school address. */
export function useStartSchoolVerification() {
  const client = useFrappClient();
  return useMutation({
    mutationKey: ["schools.verification.start"],
    mutationFn: async ({
      schoolId,
      email,
    }: {
      schoolId: string;
      email: string;
    }) => {
      const { data, error } = await client.POST(
        "/v1/schools/{schoolId}/verification",
        { params: { path: { schoolId } }, body: { email } },
      );
      if (error) throw error;
      return data as SentSchoolCode;
    },
  });
}

/** Checks the code; on success the caller is a member of the school. */
export function useConfirmSchoolVerification() {
  const client = useFrappClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["schools.verification.confirm"],
    mutationFn: async ({
      schoolId,
      code,
    }: {
      schoolId: string;
      code: string;
    }) => {
      const { data, error } = await client.POST(
        "/v1/schools/{schoolId}/verification/confirm",
        { params: { path: { schoolId } }, body: { code } },
      );
      if (error) throw error;
      return data as MySchool;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MINE_KEY });
    },
  });
}

/**
 * What a school step shows for a failed send or check. Every `school.*`
 * refusal's message is one of `@repo/validation`'s school sentences, written
 * for members (`SCHOOL_REFUSAL_COPY`, `schoolWrongDomainLine`, …), so it is
 * shown as sent. Anything else, a dropped connection included, gets the
 * step's own `fallback`.
 */
export function schoolStepErrorCopy(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const { code, message } = error as { code?: unknown; message?: unknown };
    if (
      typeof code === "string" &&
      code.startsWith("school.") &&
      typeof message === "string" &&
      message.trim()
    ) {
      return message;
    }
  }
  return fallback;
}
