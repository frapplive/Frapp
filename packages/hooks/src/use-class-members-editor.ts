import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  PLEDGE_CLASS_ASSIGNMENTS_MAX,
  PLEDGE_CLASS_SETTINGS_COPY,
} from "@repo/validation";
import {
  classAssignments,
  classRowsOf,
  type ClassEditorRow,
  type ClassMember,
} from "./pledge-class-editor";
import { useActiveChapterId } from "./use-frapp-client";
import {
  useAssignPledgeClasses,
  type PledgeClassAssignment,
} from "./use-pledge-classes";

/**
 * Why a member change wasn't saved, for the app to say its own way (a toast
 * on web, a line under the members on the phone), under
 * `PLEDGE_CLASS_SETTINGS_COPY.saveFailed(name)`.
 */
export type ClassMembersFailure =
  /** The API refused it: say its reason, or `saveFallback`. */
  | { kind: "refused"; error: unknown }
  /** Never sent: `message` says why. */
  | { kind: "notSent"; message: string };

/** The roster with `sent` applied, for when it couldn't be read back. */
function withAssignments<M extends ClassMember>(
  members: readonly M[],
  sent: readonly PledgeClassAssignment[],
): M[] {
  const byId = new Map(sent.map((entry) => [entry.member_id, entry]));
  return members.map((member) => {
    const change = byId.get(member.id);
    return change
      ? {
          ...member,
          pledge_class_id: change.pledge_class_id,
          order_number: change.order_number,
        }
      : member;
  });
}

/**
 * A pledge class's member editor on both apps (web's `settings-classes-tab.tsx`,
 * the phone's `pledge-class.tsx`): its rows, the roster they are worked out
 * against, and the save each add, removal and move makes on its own (#6033),
 * the way Discord's role members save. Each app only says a failure.
 *
 * - **Only what changed is sent** (`classAssignments`), against the roster as
 *   last read, so a member another officer added meanwhile is never read as
 *   "taken out".
 * - **One save at a time.** A change made while one is saving shows at once
 *   and is saved after it, worked out against the roster as re-read by then.
 *   Changes made meanwhile collapse into that one save. So the controls stay
 *   usable (a grip keeps its focus through a run of arrow keys), and two
 *   saves never race.
 * - **The roster is read back once.** `useAssignPledgeClasses` re-reads it
 *   before its save settles, so the editor takes that read from the cache,
 *   and reads again only when no read ran. If the read back failed, the saved
 *   change stays on screen and the roster is updated from what was sent.
 * - **A refused save puts the rows back** as the roster has them, and drops
 *   the changes queued behind it.
 *
 * `members` is the roster as first read; mount the editor once it is in.
 */
export function useClassMembersEditor<M extends ClassMember>({
  classId,
  classes,
  members: initialMembers,
  onFailure,
}: {
  classId: string;
  classes: readonly { id: string }[];
  members: readonly M[];
  /** Says a failure; `null` clears the last one, as a new change starts. */
  onFailure: (failure: ClassMembersFailure | null) => void;
}) {
  const assign = useAssignPledgeClasses();
  const queryClient = useQueryClient();
  const chapterId = useActiveChapterId();
  const [members, setMembersState] = useState<readonly M[]>(initialMembers);
  const [rows, setRows] = useState<ClassEditorRow[]>(() =>
    classRowsOf(initialMembers, classId, classes),
  );
  const [saving, setSaving] = useState(false);
  // The loop below outlives a render, so it reads these through refs.
  const membersRef = useRef<readonly M[]>(initialMembers);
  const wanted = useRef<ClassEditorRow[] | null>(null);
  const running = useRef(false);
  const latest = useRef({ classes, onFailure, assign });
  useEffect(() => {
    latest.current = { classes, onFailure, assign };
  });

  const setMembers = useCallback((next: readonly M[]) => {
    membersRef.current = next;
    setMembersState(next);
  }, []);

  /**
   * The roster as read since `since`, or null when that read failed. Reads
   * it once more only when no read ran (the roster query wasn't mounted).
   */
  const readBack = useCallback(
    async (since: number): Promise<readonly M[] | null> => {
      const key = ["members", chapterId];
      const read = () => {
        const state = queryClient.getQueryState<M[]>(key);
        if (!state) return { fresh: null, failed: false };
        if (state.status === "success" && state.dataUpdatedAt >= since) {
          return { fresh: state.data ?? null, failed: false };
        }
        return { fresh: null, failed: state.errorUpdatedAt >= since };
      };
      const first = read();
      if (first.fresh || first.failed) return first.fresh;
      await queryClient.refetchQueries({ queryKey: key, exact: true });
      return read().fresh;
    },
    [queryClient, chapterId],
  );

  const commit = useCallback(
    async (next: ClassEditorRow[]) => {
      const { onFailure: report } = latest.current;
      const changes = classAssignments(classId, next, membersRef.current);
      if (changes === null) return;
      report(null);
      // The batch cap stays as a guard; one change never comes near it.
      if (changes.length > PLEDGE_CLASS_ASSIGNMENTS_MAX) {
        report({
          kind: "notSent",
          message: PLEDGE_CLASS_SETTINGS_COPY.tooManyAtOnce(
            PLEDGE_CLASS_ASSIGNMENTS_MAX,
          ),
        });
        return;
      }
      setRows(next);
      wanted.current = next;
      if (running.current) return;
      running.current = true;
      setSaving(true);
      try {
        while (wanted.current) {
          const target = wanted.current;
          wanted.current = null;
          const { classes: order, assign: mutation } = latest.current;
          const sent = classAssignments(classId, target, membersRef.current);
          if (sent === null || sent.length === 0) continue;
          if (sent.length > PLEDGE_CLASS_ASSIGNMENTS_MAX) {
            wanted.current = null;
            latest.current.onFailure({
              kind: "notSent",
              message: PLEDGE_CLASS_SETTINGS_COPY.tooManyAtOnce(
                PLEDGE_CLASS_ASSIGNMENTS_MAX,
              ),
            });
            setRows(classRowsOf(membersRef.current, classId, order));
            break;
          }
          const since = Date.now();
          try {
            await mutation.mutateAsync(sent);
          } catch (error) {
            wanted.current = null;
            latest.current.onFailure({ kind: "refused", error });
            // Read again, so the rows put back are the roster as it is now.
            const fresh = await readBack(since);
            if (fresh) setMembers(fresh);
            setRows(classRowsOf(membersRef.current, classId, order));
            break;
          }
          const fresh = await readBack(since);
          setMembers(fresh ?? withAssignments(membersRef.current, sent));
          // A change made meanwhile is already on screen; it saves next.
          if (!wanted.current && fresh) {
            setRows(classRowsOf(fresh, classId, latest.current.classes));
          }
        }
      } finally {
        running.current = false;
        setSaving(false);
      }
    },
    [classId, readBack, setMembers],
  );

  return { rows, members, saving, commit } as const;
}
