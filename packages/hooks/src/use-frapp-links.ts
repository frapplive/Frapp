"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  frappLinkKey,
  frappLinkTarget,
  isFrappRecordLink,
  FRAPP_LINKS_RESOLVE_MAX,
  type FrappLink,
  type FrappLinkResolved,
  type FrappLinkTarget,
} from "@repo/validation";
import { useActiveChapterId, useFrappClient } from "./use-frapp-client";
import { useDocuments } from "./use-documents";
import { useEvents } from "./use-events";
import { useMeetings } from "./use-meetings";

/**
 * What each record link in `links` names for this member
 * (`POST /v1/frapp-links/resolve`, `spec/behavior/frapp-links.md`), by
 * `frappLinkKey`. Both apps draw a task's and an event's attachments from it:
 * a live name, "You don't have access", or "Removed". Web links need no
 * read. One request per distinct set of records, cached a minute.
 */
export function useFrappLinks(links: readonly FrappLink[]): {
  resolved: ReadonlyMap<string, FrappLinkResolved>;
  isLoading: boolean;
} {
  const client = useFrappClient();
  const chapterId = useActiveChapterId();
  const targets = useMemo(() => {
    const byKey = new Map<string, FrappLinkTarget>();
    for (const link of links) {
      if (!isFrappRecordLink(link)) continue;
      const target = frappLinkTarget(link);
      byKey.set(frappLinkKey(target), target);
    }
    return [...byKey.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, FRAPP_LINKS_RESOLVE_MAX);
  }, [links]);
  const keys = targets.map(([key]) => key);
  const query = useQuery({
    queryKey: ["frapp-links", chapterId, keys],
    queryFn: async ({ signal }) => {
      const { data, error } = await client.POST("/v1/frapp-links/resolve", {
        signal,
        body: { targets: targets.map(([, target]) => target) },
      });
      if (error) throw error;
      return data.links as FrappLinkResolved[];
    },
    staleTime: 60_000,
    enabled: !!chapterId && targets.length > 0,
  });
  const resolved = useMemo(
    () => new Map((query.data ?? []).map((answer) => [answer.key, answer])),
    [query.data],
  );
  return { resolved, isLoading: query.isLoading && targets.length > 0 };
}

/** One record the attach menu offers. */
export interface FrappLinkCandidate {
  target: FrappLinkTarget;
  /** The record's name, as the member sees it in its own list. */
  name: string;
  /** "Chapter Files", the meeting's or event's start (ISO), for the row's quiet line. */
  kind: "document" | "minutes" | "event";
  date: string | null;
}

/**
 * What the attach menu offers, both apps: the member's own reads of Chapter
 * Files, the minutes they may read and the calendar, so it never offers a
 * record they can't open. Filtered by `search` (a name's words, any case),
 * newest first within each kind, at most `limit` of each. Read only while
 * the menu is open.
 */
export function useFrappLinkCandidates(
  search: string,
  options: {
    enabled: boolean;
    limit?: number;
    /** False when Chapter Files is off: no file is offered or read. */
    documents?: boolean;
  },
): { candidates: FrappLinkCandidate[]; isLoading: boolean; isError: boolean } {
  const limit = options.limit ?? 6;
  const withDocuments = options.documents !== false;
  const documents = useDocuments({
    enabled: options.enabled && withDocuments,
  });
  const meetings = useMeetings({ enabled: options.enabled });
  const events = useEvents({ enabled: options.enabled });
  const candidates = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (name: string) => {
      const lower = name.toLowerCase();
      return words.every((word) => lower.includes(word));
    };
    const docs: FrappLinkCandidate[] = (
      withDocuments ? (documents.data ?? []) : []
    )
      .filter((doc) => matches(doc.title))
      .slice(0, limit)
      .map((doc) => ({
        target: { kind: "document", document_id: doc.id },
        name: doc.title,
        kind: "document",
        date: null,
      }));
    const minutes: FrappLinkCandidate[] = (meetings.data ?? [])
      .filter((row) => matches(row.event_name))
      .slice(0, limit)
      .map((row) => ({
        target: { kind: "minutes", meeting_id: row.id },
        name: row.event_name,
        kind: "minutes",
        date: row.event_start_time,
      }));
    const calendar: FrappLinkCandidate[] = [...(events.data ?? [])]
      .filter((row) => matches(row.name))
      .sort((a, b) => b.start_time.localeCompare(a.start_time))
      .slice(0, limit)
      .map((row) => ({
        target: { kind: "event", event_id: row.id },
        name: row.name,
        kind: "event",
        date: row.start_time,
      }));
    return [...docs, ...minutes, ...calendar];
  }, [
    documents.data,
    meetings.data,
    events.data,
    search,
    limit,
    withDocuments,
  ]);
  return {
    candidates,
    isLoading:
      (withDocuments && documents.isLoading) ||
      meetings.isLoading ||
      events.isLoading,
    /** A read failed, so what's offered may be missing records. */
    isError:
      (withDocuments && documents.isError) ||
      meetings.isError ||
      events.isError,
  };
}
