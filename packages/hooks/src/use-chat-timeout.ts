/**
 * Chat timeouts (#6006, `spec/behavior/chat/README.md` § Timeouts): the
 * caller's own timeout, which the composer reads to say "You're timed out
 * until 3:40 PM", and an officer's Time out and Lift timeout.
 *
 * The copy and the predicates live in `@repo/chat-core/chat-timeout`; the
 * rules in `@repo/validation`.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChatTimeoutDurationKey } from "@repo/validation";
import { useActiveChapterId, useFrappClient } from "./use-frapp-client";

const MY_TIMEOUT = "chat-timeout";

/**
 * The caller's own timeout in the active chapter. A chapter with nothing
 * running reads `{ until: null, reason: null }`. A failed read (a council,
 * which serves no timeouts, or an older API) reads as none: the server still
 * refuses a timed-out write, and that refusal refetches this.
 */
export function useMyChatTimeout() {
  const client = useFrappClient();
  const chapterId = useActiveChapterId();
  return useQuery({
    queryKey: [MY_TIMEOUT, chapterId, "me"],
    queryFn: async ({ signal }) => {
      const { data, error } = await client.GET("/v1/chat/timeout", { signal });
      if (error) return { until: null, reason: null };
      return data;
    },
    // Read again on focus and every few minutes, so a timeout an officer set
    // while the app sat open shows up without a refused send first.
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    enabled: !!chapterId,
  });
}

/** Re-read the caller's own timeout, after a send the server refused for one. */
export function useRefreshMyChatTimeout() {
  const queryClient = useQueryClient();
  const chapterId = useActiveChapterId();
  return () =>
    queryClient.invalidateQueries({ queryKey: [MY_TIMEOUT, chapterId] });
}

/**
 * Time a member out, by their membership id. Offer it where the profile read
 * says `viewer_can_timeout`, or from a message's menu (`canTimeOutSender`),
 * where the server's rank rule answers a 403 the dialog shows.
 */
export function useTimeOutMember() {
  const client = useFrappClient();
  const queryClient = useQueryClient();
  const chapterId = useActiveChapterId();
  return useMutation({
    mutationKey: ["members", "chat-timeout"],
    mutationFn: async ({
      memberId,
      duration,
      reason,
    }: {
      memberId: string;
      duration: ChatTimeoutDurationKey;
      reason?: string | null;
    }) => {
      const { data, error } = await client.PUT(
        "/v1/members/{id}/chat-timeout",
        {
          params: { path: { id: memberId } },
          body: { duration, reason: reason?.trim() || null },
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // The member's profile shows it, with Lift timeout.
      queryClient.invalidateQueries({ queryKey: ["members", chapterId] });
    },
  });
}

/** Lift a member's timeout early, by their membership id. */
export function useLiftChatTimeout() {
  const client = useFrappClient();
  const queryClient = useQueryClient();
  const chapterId = useActiveChapterId();
  return useMutation({
    mutationKey: ["members", "lift-chat-timeout"],
    mutationFn: async ({ memberId }: { memberId: string }) => {
      const { data, error } = await client.DELETE(
        "/v1/members/{id}/chat-timeout",
        { params: { path: { id: memberId } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", chapterId] });
    },
  });
}
