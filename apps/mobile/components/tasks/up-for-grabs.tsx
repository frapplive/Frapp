import { useCallback, useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  useClaimOpenTask,
  useOpenTasks,
  useReleaseTask,
  useViewerUserId,
  type OpenTask,
} from "@repo/hooks";
import { errorCopy } from "@repo/hooks/error-copy";
import { TASK_AUDIENCE_COPY } from "@repo/validation";
import type { SignetTokens } from "@repo/theme/signet";
import { InlineNote } from "@/components/inline-note";
import { SectionHeader } from "@/components/list-section";
import { OpenTaskRow } from "@/components/tasks/open-task-row";
import {
  ASSIGNED_PARAM,
  claimLost,
  claimedLine,
  claimedTaskId,
  RELEASE_FAILED,
  RELEASED_LINE,
  RELEASED_PARAM,
  selectOpenTasks,
} from "@/lib/tasks/open-tasks";
import { taskCreatedLine } from "@/lib/tasks/create-task";
import { useMemberLabel } from "@/lib/tasks/use-member-label";
import { successHaptic } from "@/lib/haptics";
import { useFrappTheme } from "@/lib/theme";

const CLAIM_FAILED = "Couldn't claim that task. Try again.";

/** How long the card's line stays, the undo bar's few seconds. */
export const UP_FOR_GRABS_LINE_MS = 8_000;
const LINE_MS = UP_FOR_GRABS_LINE_MS;

/** The card's one line: what a claim or a give-back did, and its Undo. */
type UpForGrabsLine = {
  text: string;
  /** The task a claim made, which Give it back returns to Up for grabs. */
  giveBack?: string;
};

/**
 * Up for grabs, a card in Activity's Mine (#5948 slice 3; web's Mine draws
 * the same card, `apps/web/components/tasks/up-for-grabs.tsx`): what this
 * member may claim, and for an officer who manages tasks every open posting
 * (`spec/behavior/tasks.md` § Up for grabs). It was the head of the phone's
 * Tasks screen until that screen folded into Activity.
 *
 * A claim is optimistic in the hook: the row leaves on the tap, the task
 * joins the member's To do once Activity reads again, and the card's line
 * says what was claimed with Give it back beside it. A claim another member
 * won (a 409) says so, and the row stays gone until the list reads again.
 *
 * Two arrivals speak here too, as they did on the Tasks screen: the task's
 * screen gave a task back (`/activity?released=1`), or a posting's screen
 * handed it to a member (`/activity?assigned=<userId>`, #5570). Each is said
 * once and dropped from the address.
 *
 * Nothing open draws nothing; a failed read with nothing to show says so in
 * one line, so a member isn't told nothing is open when the list didn't load.
 */
export function UpForGrabs({ now }: { now: Date }) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const router = useRouter();
  const viewerUserId = useViewerUserId();
  const openTasksQuery = useOpenTasks();
  const claimOpen = useClaimOpenTask();
  const releaseTask = useReleaseTask();
  const [line, setLine] = useState<UpForGrabsLine | null>(null);

  // A lost claim hides its posting only until the list reads again: the
  // fresh read leaves out a claimed posting itself, and shows it again if
  // its taker gives it back. So each hide is keyed to the read it was made on.
  const readAt = openTasksQuery.dataUpdatedAt;
  const [lostClaims, setLostClaims] = useState<{
    readAt: number;
    ids: ReadonlySet<string>;
  }>(() => ({ readAt: 0, ids: new Set() }));
  const openTasks = useMemo(
    () =>
      selectOpenTasks(
        openTasksQuery.data,
        lostClaims.readAt === readAt ? lostClaims.ids : new Set(),
      ),
    [openTasksQuery.data, lostClaims, readAt],
  );

  // The line goes after a few seconds, as the board's undo bar did: a Give it
  // back left standing would outlive the claim (the task done, its proof
  // sent) and fail when pressed.
  useEffect(() => {
    if (line === null) return undefined;
    const timer = setTimeout(() => setLine(null), LINE_MS);
    return () => clearTimeout(timer);
  }, [line]);

  const say = useCallback((next: UpForGrabsLine | null) => {
    setLine(next);
    if (next) AccessibilityInfo.announceForAccessibility(next.text);
  }, []);

  const claim = useCallback(
    (posting: OpenTask) => {
      setLine(null);
      claimOpen.mutate(posting.id, {
        onSuccess: (data) => {
          successHaptic();
          const taskId = claimedTaskId(data);
          say({
            text: claimedLine(posting, now),
            ...(taskId ? { giveBack: taskId } : {}),
          });
        },
        onError: (error) => {
          if (claimLost(error)) {
            setLostClaims((lost) => ({
              readAt,
              ids:
                lost.readAt === readAt
                  ? new Set(lost.ids).add(posting.id)
                  : new Set([posting.id]),
            }));
            say({ text: TASK_AUDIENCE_COPY.alreadyClaimed });
            return;
          }
          say({
            text: errorCopy(error, CLAIM_FAILED, {
              serverWritesForMembers: true,
            }),
          });
        },
      });
    },
    [claimOpen, now, readAt, say],
  );

  const giveBack = useCallback(
    (taskId: string) => {
      setLine(null);
      releaseTask.mutate(taskId, {
        onSuccess: () => say({ text: RELEASED_LINE }),
        onError: (error) =>
          say({
            text: errorCopy(error, RELEASE_FAILED, {
              serverWritesForMembers: true,
            }),
          }),
      });
    },
    [releaseTask, say],
  );

  // `?released=1` and `?assigned=<userId>`: said once, then dropped, so
  // coming back to the tab doesn't say them again.
  const nameOf = useMemberLabel();
  const { [RELEASED_PARAM]: released, [ASSIGNED_PARAM]: assignedTo } =
    useLocalSearchParams<{
      [RELEASED_PARAM]?: string;
      [ASSIGNED_PARAM]?: string;
    }>();
  const arrival =
    released === "1"
      ? "released"
      : typeof assignedTo === "string" && assignedTo !== ""
        ? `assigned:${assignedTo}`
        : null;
  const [arrivalSeen, setArrivalSeen] = useState<string | null>(null);
  if (arrival !== null && arrival !== arrivalSeen) {
    setArrivalSeen(arrival);
    setLine({
      text:
        arrival === "released"
          ? RELEASED_LINE
          : taskCreatedLine(
              nameOf(assignedTo as string),
              assignedTo === viewerUserId,
            ),
    });
  } else if (arrival === null && arrivalSeen !== null) {
    setArrivalSeen(null);
  }
  const arrived = arrivalSeen !== null;
  useEffect(() => {
    if (!arrived) return;
    router.setParams({
      [RELEASED_PARAM]: undefined,
      [ASSIGNED_PARAM]: undefined,
    });
  }, [arrived, router]);

  const note = line ? (
    <InlineNote
      action={
        line.giveBack
          ? {
              label: TASK_AUDIENCE_COPY.release,
              onPress: () => giveBack(line.giveBack!),
            }
          : undefined
      }
    >
      {line.text}
    </InlineNote>
  ) : null;

  if (openTasks.length === 0) {
    const failed = openTasksQuery.isError && openTasksQuery.data === undefined;
    if (!failed && !note) return null;
    return (
      <View style={styles.group}>
        {note}
        {failed ? (
          <InlineNote>{`Couldn't load ${TASK_AUDIENCE_COPY.upForGrabs}. Pull down to try again.`}</InlineNote>
        ) : null}
      </View>
    );
  }
  return (
    <View style={styles.group} testID="activity-up-for-grabs">
      <SectionHeader count={openTasks.length}>
        {TASK_AUDIENCE_COPY.upForGrabs}
      </SectionHeader>
      {note}
      <View>
        {openTasks.map((posting, index) => (
          <OpenTaskRow
            key={posting.id}
            posting={posting}
            now={now}
            isFirst={index === 0}
            onClaim={
              posting.viewer_can_claim ? () => claim(posting) : undefined
            }
            // Its own screen, as a task's (#5570).
            onOpen={() =>
              router.push({
                pathname: "/task-details",
                params: { posting: posting.id },
              })
            }
          />
        ))}
      </View>
    </View>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    group: {
      gap: tokens.spacing.sm,
    },
  });
}
