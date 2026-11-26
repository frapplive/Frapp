import { useState, type ReactNode } from "react";
import { AccessibilityInfo } from "react-native";
import { useRequestTaskExtension } from "@repo/hooks";
import { AskForMoreTimeSheet } from "@/components/tasks/ask-more-time-sheet";
import type { TaskRowModel } from "@/lib/tasks/board";
import { extensionAskedLine } from "@/lib/tasks/extension";

export interface AskForMoreTime {
  /** Opens the Ask sheet on this task. */
  ask: (row: TaskRowModel) => void;
  /** The sheet while it is open; render once. */
  host: ReactNode;
}

/**
 * Ask for more time (#6096) for the task screen's bar and a row's long-press
 * menu alike, as `useTaskReview` serves Send back to both: the sheet takes
 * the new due and the reason, sends `POST /v1/tasks/:id/extension-requests`,
 * and once it lands `onAsked` gets what to say ("More time granted · now due
 * Saturday", or that it waits on an officer, and when it was the third in
 * 30 days, that they can't ask again yet). A refusal stays on the sheet.
 */
export function useAskForMoreTime(
  onAsked: (line: string) => void,
): AskForMoreTime {
  const request = useRequestTaskExtension();
  const [asking, setAsking] = useState<TaskRowModel | null>(null);
  const host = asking ? (
    <AskForMoreTimeSheet
      key={asking.id}
      row={asking}
      onSubmit={async (body) => {
        const result = await request.mutateAsync({ id: asking.id, body });
        const line = extensionAskedLine(result);
        AccessibilityInfo.announceForAccessibility(line);
        onAsked(line);
      }}
      onClosed={() => setAsking(null)}
    />
  ) : null;
  return { ask: setAsking, host };
}
