import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { statusOf } from "@repo/api-sdk";
import { errorCopy } from "@repo/hooks/error-copy";
import {
  extensionDueWords,
  useApproveTaskExtension,
  useDeclineTaskExtension,
  type ActivityRow,
} from "@repo/hooks";
import { formatRelativeDayTime } from "@repo/formatting";
import {
  TASK_EXTENSION_COPY,
  TASK_EXTENSION_NEEDS_OFFICER_LABELS,
} from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { CardActions, CardButton, CardNote } from "@/components/chat/chat-card";
import { DeclineExtensionSheet } from "@/components/tasks/decline-extension-sheet";
import { useConnection } from "@/lib/connection/use-connection";
import { typeRole, useFrappTheme } from "@/lib/theme";

type ExtensionRow = Extract<ActivityRow, { kind: "extension" }>;

/**
 * A request for more time an officer decides (#6096, `spec/behavior/tasks.md`
 * § Asking for more time), in Activity's sheet as a service entry's review
 * is: who asks and when, the task, the due it moves from and to, the reason,
 * why it waits on an officer, and AI's note when it judged the reason
 * invalid; then Approve and Decline, as Canvas's and Google Classroom's
 * extension requests put them. Decline asks for a reason in its own sheet,
 * as Send back does. The sheet stays open on the answer, as a review's does,
 * and the row leaves Needs you underneath. Someone answering first (a 409)
 * says so in the server's words and re-reads.
 */
export function ExtensionDecision({
  row,
  onActed,
}: {
  row: ExtensionRow;
  /** Re-reads Activity: the row leaves once it is answered. */
  onActed: () => void;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const { extension } = row;
  const approve = useApproveTaskExtension();
  const decline = useDeclineTaskExtension();
  const { writeBlockedReason } = useConnection();
  const [decided, setDecided] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const inFlight = useRef(false);
  // Read once per sheet, so the words don't change under the officer.
  const [now] = useState(() => new Date());

  const to = extensionDueWords(extension, now);
  const from = extensionDueWords(
    { to_due_date: extension.from_due_date, to_due_at: extension.from_due_at },
    now,
  );
  const asked = formatRelativeDayTime(extension.created_at, now);
  const why = extension.needs_officer
    ? TASK_EXTENSION_NEEDS_OFFICER_LABELS[extension.needs_officer]
    : null;

  const refused = (error: unknown, fallback: string) => {
    setFailure(errorCopy(error, fallback, { serverWritesForMembers: true }));
    // Answered elsewhere, or the task moved past it: the list says which.
    if (statusOf(error) === 409) onActed();
  };

  const runApprove = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setFailure(null);
    try {
      await approve.mutateAsync({
        taskId: extension.task.id,
        requestId: extension.id,
      });
      setDecided(`Extended to ${to}`);
      onActed();
    } catch (error) {
      refused(error, TASK_EXTENSION_COPY.approveFailed);
    } finally {
      inFlight.current = false;
    }
  };

  const disabled =
    approve.isPending ||
    decline.isPending ||
    declining ||
    writeBlockedReason !== null;
  const hint = writeBlockedReason ?? undefined;

  return (
    <>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">
          {row.title}
        </Text>
        <Text style={styles.detail}>
          {[extension.task.title, asked].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <View style={styles.facts}>
        <Text style={styles.body}>{`Due ${from} → ${to}`}</Text>
        <Text style={styles.body} selectable>
          {extension.reason}
        </Text>
        {why ? <Text style={styles.detail}>{why}</Text> : null}
        {extension.ai_verdict === "invalid" && extension.ai_note ? (
          <Text style={styles.detail}>{extension.ai_note}</Text>
        ) : null}
      </View>
      {decided ? (
        <CardNote tone="success" text={decided} />
      ) : (
        <CardActions>
          <CardButton
            label={TASK_EXTENSION_COPY.approve}
            variant="primary"
            disabled={disabled}
            accessibilityHint={hint}
            onPress={() => void runApprove()}
          />
          <CardButton
            label={TASK_EXTENSION_COPY.decline}
            disabled={disabled}
            accessibilityHint={hint ?? "Opens a sheet for your reason."}
            onPress={() => {
              setFailure(null);
              setDeclining(true);
            }}
          />
        </CardActions>
      )}
      {failure ? <CardNote tone="error" text={failure} /> : null}
      {declining ? (
        <DeclineExtensionSheet
          requestId={extension.id}
          taskTitle={extension.task.title}
          onSubmit={async (reason) => {
            try {
              await decline.mutateAsync({
                taskId: extension.task.id,
                requestId: extension.id,
                reason,
              });
            } catch (error) {
              // Someone answered first: the list re-reads; the sheet says it.
              if (statusOf(error) === 409) onActed();
              throw error;
            }
            setDecided(`${TASK_EXTENSION_COPY.declined}: ${reason}`);
            onActed();
          }}
          onClosed={() => setDeclining(false)}
        />
      ) : null}
    </>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    head: {
      gap: tokens.spacing.xs,
    },
    title: {
      ...typeRole({
        ...tokens.typography.role.body,
        weight: tokens.typography.weight.bold,
      }),
      color: tokens.color.text.foreground,
    },
    detail: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
    facts: {
      gap: tokens.spacing.xs,
    },
    body: {
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.foreground,
    },
  });
}
