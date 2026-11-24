"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@repo/api-sdk";
import {
  AFFILIATION_EXISTS_CODE,
  AFFILIATION_INVALID_TRANSITION_CODE,
  AFFILIATION_NO_SHARED_SCHOOL_CODE,
  AFFILIATION_NOT_FOUND_CODE,
  type CouncilLinkDecision,
  type SchoolLinkDecision,
} from "@repo/validation";
import { ARCHETYPES } from "@repo/org-archetypes";
import { errorCopy } from "./error-copy";
import { useActiveChapterId, useFrappClient } from "./use-frapp-client";

/**
 * Affiliations (#5974, `school-layer.md` § 2.4): the council's Chapters list
 * and a chapter's School and council page. Each read is keyed by the active
 * tenant, so a switch never shows another tenant's links.
 */

/** A council's member, suspended, invited or requesting chapter. */
export type CouncilChapterRow = components["schemas"]["CouncilChapterDto"];
/** A chapter the council can invite. */
export type InviteCandidate = components["schemas"]["InviteCandidateDto"];
/** A chapter's school and councils. */
export type ChapterAffiliations =
  components["schemas"]["ChapterAffiliationsDto"];
export type ChapterCouncilRow = components["schemas"]["ChapterCouncilDto"];
export type CouncilLink = components["schemas"]["CouncilLinkDto"];

const councilChaptersKey = (councilId: string | null) =>
  ["council-chapters", councilId] as const;
const chapterAffiliationsKey = (chapterId: string | null) =>
  ["chapter-affiliations", chapterId] as const;

// The council's side ------------------------------------------------------------

/** The council's chapters, newest first (any council member). */
export function useCouncilChapters(options?: { enabled?: boolean }) {
  const client = useFrappClient();
  const councilId = useActiveChapterId();
  return useQuery({
    queryKey: councilChaptersKey(councilId),
    queryFn: async ({ signal }) => {
      const { data, error } = await client.GET("/v1/council/chapters", {
        signal,
      });
      if (error) throw error;
      return (data ?? []) as CouncilChapterRow[];
    },
    enabled: (options?.enabled ?? true) && !!councilId,
    staleTime: 30_000,
  });
}

/** Chapters the council can invite (`council:chapters_manage`). */
export function useCouncilInviteCandidates(options?: { enabled?: boolean }) {
  const client = useFrappClient();
  const councilId = useActiveChapterId();
  return useQuery({
    queryKey: [...councilChaptersKey(councilId), "candidates"],
    queryFn: async ({ signal }) => {
      const { data, error } = await client.GET(
        "/v1/council/chapters/candidates",
        { signal },
      );
      if (error) throw error;
      return (data ?? []) as InviteCandidate[];
    },
    enabled: (options?.enabled ?? true) && !!councilId,
    staleTime: 30_000,
  });
}

/** Invites a chapter to the council. */
export function useInviteChapter() {
  const client = useFrappClient();
  const queryClient = useQueryClient();
  const councilId = useActiveChapterId();
  return useMutation({
    mutationKey: ["council-chapters", "invite"],
    mutationFn: async (chapterId: string) => {
      const { data, error } = await client.POST("/v1/council/chapters", {
        body: { chapter_id: chapterId },
      });
      if (error) throw error;
      return data as CouncilLink;
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: councilChaptersKey(councilId),
      }),
  });
}

/** Accepts, declines, suspends, reinstates or removes a chapter. */
export function useDecideCouncilChapter() {
  const client = useFrappClient();
  const queryClient = useQueryClient();
  const councilId = useActiveChapterId();
  return useMutation({
    mutationKey: ["council-chapters", "decide"],
    mutationFn: async (input: {
      linkId: string;
      status: CouncilLinkDecision;
    }) => {
      const { data, error } = await client.PATCH(
        "/v1/council/chapters/{linkId}",
        {
          params: { path: { linkId: input.linkId } },
          body: { status: input.status },
        },
      );
      if (error) throw error;
      return data as CouncilLink;
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: councilChaptersKey(councilId),
      }),
  });
}

// The chapter's side ------------------------------------------------------------

/** The chapter's school links and the councils at its school (`chapter-config:view`). */
export function useChapterAffiliations(options?: { enabled?: boolean }) {
  const client = useFrappClient();
  const chapterId = useActiveChapterId();
  return useQuery({
    queryKey: chapterAffiliationsKey(chapterId),
    queryFn: async ({ signal }) => {
      const { data, error } = await client.GET("/v1/chapter/affiliations", {
        signal,
      });
      if (error) throw error;
      return data as ChapterAffiliations;
    },
    enabled: (options?.enabled ?? true) && !!chapterId,
    staleTime: 30_000,
  });
}

function useInvalidateChapterAffiliations() {
  const queryClient = useQueryClient();
  const chapterId = useActiveChapterId();
  return () =>
    queryClient.invalidateQueries({
      queryKey: chapterAffiliationsKey(chapterId),
    });
}

/** Names and confirms the chapter's school. */
export function useLinkChapterSchool() {
  const client = useFrappClient();
  const invalidate = useInvalidateChapterAffiliations();
  return useMutation({
    mutationKey: ["chapter-affiliations", "school"],
    mutationFn: async (schoolId: string) => {
      const { data, error } = await client.POST(
        "/v1/chapter/affiliations/school",
        { body: { school_id: schoolId } },
      );
      if (error) throw error;
      return data;
    },
    onSettled: invalidate,
  });
}

/** Confirms, declines or ends a school link. */
export function useDecideChapterSchool() {
  const client = useFrappClient();
  const invalidate = useInvalidateChapterAffiliations();
  return useMutation({
    mutationKey: ["chapter-affiliations", "school-decide"],
    mutationFn: async (input: {
      linkId: string;
      status: SchoolLinkDecision;
    }) => {
      const { data, error } = await client.PATCH(
        "/v1/chapter/affiliations/school/{linkId}",
        {
          params: { path: { linkId: input.linkId } },
          body: { status: input.status },
        },
      );
      if (error) throw error;
      return data;
    },
    onSettled: invalidate,
  });
}

/** Asks to join a council. */
export function useRequestCouncil() {
  const client = useFrappClient();
  const invalidate = useInvalidateChapterAffiliations();
  return useMutation({
    mutationKey: ["chapter-affiliations", "request"],
    mutationFn: async (councilId: string) => {
      const { data, error } = await client.POST(
        "/v1/chapter/affiliations/councils",
        { body: { council_id: councilId } },
      );
      if (error) throw error;
      return data as CouncilLink;
    },
    onSettled: invalidate,
  });
}

/** Accepts or declines a council's invitation, withdraws a request, or leaves. */
export function useDecideChapterCouncil() {
  const client = useFrappClient();
  const invalidate = useInvalidateChapterAffiliations();
  return useMutation({
    mutationKey: ["chapter-affiliations", "council-decide"],
    mutationFn: async (input: {
      linkId: string;
      status: CouncilLinkDecision;
    }) => {
      const { data, error } = await client.PATCH(
        "/v1/chapter/affiliations/councils/{linkId}",
        {
          params: { path: { linkId: input.linkId } },
          body: { status: input.status },
        },
      );
      if (error) throw error;
      return data as CouncilLink;
    },
    onSettled: invalidate,
  });
}

/**
 * What a failed affiliation step says. The API's sentences for its own
 * refusals are written for officers; anything else goes through
 * `errorCopy` with the caller's fallback.
 */
export function affiliationErrorCopy(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const { code, message } = error as { code?: unknown; message?: unknown };
    if (
      (code === AFFILIATION_EXISTS_CODE ||
        code === AFFILIATION_INVALID_TRANSITION_CODE ||
        code === AFFILIATION_NO_SHARED_SCHOOL_CODE ||
        code === AFFILIATION_NOT_FOUND_CODE) &&
      typeof message === "string" &&
      message.trim()
    ) {
      return message;
    }
  }
  return errorCopy(error, fallback);
}

/** The live links, in the three lists both apps draw. */
export interface CouncilChapterGroups {
  /** A chapter asked to join and the council hasn't answered. */
  requests: CouncilChapterRow[];
  /** Accepted and suspended, by name. */
  members: CouncilChapterRow[];
  /** The council invited and the chapter hasn't answered. */
  invited: CouncilChapterRow[];
}

/**
 * Splits the council's links into the lists the Chapters page (web) and the
 * council home's Chapters section (phone) draw. Declined and ended links are
 * history and show nowhere. Requests and invitations keep the API's order
 * (newest first); members read by name, a suspended one in its place among
 * them, so the list doesn't reshuffle when one is suspended.
 */
export function groupCouncilChapters(
  rows: readonly CouncilChapterRow[],
): CouncilChapterGroups {
  const groups: CouncilChapterGroups = {
    requests: [],
    members: [],
    invited: [],
  };
  for (const row of rows) {
    const { status, proposed_by_side: side } = row.link;
    if (status === "proposed" && side === "chapter") groups.requests.push(row);
    else if (status === "proposed") groups.invited.push(row);
    else if (status === "accepted" || status === "suspended") {
      groups.members.push(row);
    }
  }
  groups.members.sort((a, b) => a.chapter.name.localeCompare(b.chapter.name));
  return groups;
}

/**
 * A chapter's line under its name, from its public listing only: its kind
 * of organization, then its school ("IFC Fraternity · Rensselaer
 * Polytechnic Institute"). An archetype it doesn't know is left out, never
 * guessed; a blank school is left out too.
 */
export function chapterListingLine(chapter: {
  org_archetype: string | null;
  university: string;
}): string {
  const key = chapter.org_archetype;
  const kind =
    key && Object.hasOwn(ARCHETYPES, key)
      ? ARCHETYPES[key as keyof typeof ARCHETYPES].label
      : null;
  return [kind, chapter.university.trim() || null].filter(Boolean).join(" · ");
}
