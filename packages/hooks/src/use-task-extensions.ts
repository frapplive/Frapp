"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@repo/api-sdk";
import { useActiveChapterId, useFrappClient } from "./use-frapp-client";
import { useChapterScope } from "./chapter-scope";
import { invalidateTask } from "./use-tasks";
import { TASK_EXTENSION_COPY } from "@repo/validation";
import { extensionDueWords } from "./activity-rows";

/**
 * Asking for more time on a task (#6096, `spec/behavior/tasks.md` § Asking
 * for more time): the assignee asks, an officer approves or declines, and an
 * officer restores a member who used 3 extensions in 30 days. None of these
 * is optimistic: whether an ask is approved at once is the server's call
 * (a day, a first request, and a reason AI judges valid), and approving
 * moves the due through the officer's edit. Each settles by re-reading the
 * task and Activity.
 */

/** The latest request a task read carries (`extension`). */
export type TaskExtensionSummary =
  components["schemas"]["TaskExtensionSummaryDto"];

export type RequestTaskExtensionResult =
  components["schemas"]["RequestTaskExtensionResponseDto"];

/**
 * What a task says about its latest decided request, the same on the web
 * panel and the phone's task screen: "Extended to Saturday · approved
 * automatically", or "Not extended: <the officer's reason>". Null while it
 * waits, or when it was withdrawn.
 */
export function extensionDecidedLine(
  extension: Pick<
    TaskExtensionSummary,
    "status" | "auto_approved" | "decline_reason" | "to_due_date" | "to_due_at"
  >,
  now: Date = new Date(),
): string | null {
  if (extension.status === "approved") {
    const to = `Extended to ${extensionDueWords(extension, now)}`;
    return extension.auto_approved ? `${to} · approved automatically` : to;
  }
  if (extension.status === "declined") {
    return extension.decline_reason
      ? `${TASK_EXTENSION_COPY.declined}: ${extension.decline_reason}`
      : TASK_EXTENSION_COPY.declined;
  }
  return null;
}

export const taskExtensionKeys = {
  blocked: (chapterId: string | null) =>
    ["task-extensions", chapterId, "blocked"] as const,
};

export function useRequestTaskExtension() {
  const client = useFrappClient();
  const queryClient = useQueryClient();
  const chapterId = useActiveChapterId();
  return useMutation({
    mutationKey: ["tasks", "request-extension"],
    // No retry: a lost response retried would be refused as already asked.
    retry: false,
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: { due_date: string; due_at?: string | null; reason: string };
    }): Promise<RequestTaskExtensionResult> => {
      const { data, error } = await client.POST(
        "/v1/tasks/{id}/extension-requests",
        { params: { path: { id } }, body },
      );
      if (error) throw error;
      return data;
    },
    onSettled: (_data, _error, { id }) => {
      invalidateTask(queryClient, chapterId, id);
    },
  });
}

export function useApproveTaskExtension() {
  const client = useFrappClient();
  const queryClient = useQueryClient();
  const chapterId = useActiveChapterId();
  return useMutation({
    mutationKey: ["tasks", "approve-extension"],
    retry: false,
    mutationFn: async ({
      taskId,
      requestId,
    }: {
      taskId: string;
      requestId: string;
    }) => {
      const { data, error } = await client.POST(
        "/v1/tasks/{id}/extension-requests/{requestId}/approve",
        { params: { path: { id: taskId, requestId } } },
      );
      if (error) throw error;
      return data;
    },
    onSettled: (_data, _error, { taskId }) => {
      invalidateTask(queryClient, chapterId, taskId);
      queryClient.invalidateQueries({
        queryKey: taskExtensionKeys.blocked(chapterId),
      });
    },
  });
}

export function useDeclineTaskExtension() {
  const client = useFrappClient();
  const queryClient = useQueryClient();
  const chapterId = useActiveChapterId();
  return useMutation({
    mutationKey: ["tasks", "decline-extension"],
    retry: false,
    mutationFn: async ({
      taskId,
      requestId,
      reason,
    }: {
      taskId: string;
      requestId: string;
      reason: string;
    }) => {
      const { data, error } = await client.POST(
        "/v1/tasks/{id}/extension-requests/{requestId}/decline",
        { params: { path: { id: taskId, requestId } }, body: { reason } },
      );
      if (error) throw error;
      return data;
    },
    onSettled: (_data, _error, { taskId }) => {
      invalidateTask(queryClient, chapterId, taskId);
    },
  });
}

/**
 * The members who can't ask for more time until an officer restores it,
 * for a `tasks:manage` holder (`enabled` only for one: the route 403s
 * anyone else).
 */
export function useBlockedFromExtensions(options: { enabled?: boolean } = {}) {
  const client = useFrappClient();
  const chapterId = useActiveChapterId();
  const scope = useChapterScope();
  return useQuery({
    queryKey: taskExtensionKeys.blocked(chapterId),
    queryFn: async ({ signal }) => {
      const { data, error } = await client.GET(
        "/v1/tasks/extension-requests/blocked",
        { signal },
      );
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
    enabled: scope === "chapter" && (options.enabled ?? true),
  });
}

export function useRestoreTaskExtensions() {
  const client = useFrappClient();
  const queryClient = useQueryClient();
  const chapterId = useActiveChapterId();
  return useMutation({
    mutationKey: ["tasks", "restore-extensions"],
    mutationFn: async (userId: string) => {
      const { error } = await client.POST(
        "/v1/tasks/extension-requests/restore",
        { body: { user_id: userId } },
      );
      if (error) throw error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: taskExtensionKeys.blocked(chapterId),
      });
      // The member's own task reads carry whether they can ask.
      queryClient.invalidateQueries({ queryKey: ["tasks", chapterId] });
    },
  });
}
