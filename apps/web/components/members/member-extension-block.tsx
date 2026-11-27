"use client";

import {
  useBlockedFromExtensions,
  useRestoreTaskExtensions,
} from "@repo/hooks";
import { TASK_EXTENSION_COPY } from "@repo/validation";
import { useSubscriptionGate } from "@/components/shared/subscription-gate";
import { Button } from "@/components/ui/button";
import { useToast } from "@/lib/hooks/use-toast";
import { getErrorMessage } from "@/lib/utils";

/**
 * A member who used 3 extensions in 30 days, on their profile, for an
 * officer who can let them ask again (#6096, `spec/behavior/tasks.md`
 * § Asking for more time): the reason they can't, and Restore extension
 * requests. Nothing for anyone else, or for a member who can still ask.
 */
export function MemberExtensionBlock({
  userId,
  canManageTasks,
}: {
  userId: string | null;
  /** `tasks:manage`, with Tasks on: the list 403s anyone else. */
  canManageTasks: boolean;
}) {
  const blocked = useBlockedFromExtensions({ enabled: canManageTasks });
  const restore = useRestoreTaskExtensions();
  const gate = useSubscriptionGate();
  const { toast } = useToast();
  if (!canManageTasks || !userId) return null;
  if (!blocked.data?.some((entry) => entry.user_id === userId)) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-caption text-warning">
        {TASK_EXTENSION_COPY.blockedBadge}
      </p>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        {...gate.controlProps(restore.isPending)}
        onClick={() =>
          restore.mutate(userId, {
            onSuccess: () => toast({ title: TASK_EXTENSION_COPY.restored }),
            onError: (error) =>
              toast({
                title: TASK_EXTENSION_COPY.restoreFailed,
                description: getErrorMessage(error, "Try again in a moment.", {
                  serverWritesForMembers: true,
                }),
                variant: "destructive",
              }),
          })
        }
      >
        {TASK_EXTENSION_COPY.restore}
      </Button>
    </div>
  );
}
