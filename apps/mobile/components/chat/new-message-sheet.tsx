import { useEffect, useMemo, useRef, useState } from "react";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  DM_SEARCH_BLOCK_LIST_FAILED,
  DM_SEARCH_CHECKING_BLOCK_LIST,
  DM_SEARCH_MEMBERS_WAITING,
  messageableMembers,
  NEW_MESSAGE_MAX_PEOPLE,
  NEW_MESSAGE_MEMBERS_FAILED,
  NEW_MESSAGE_TITLE,
  newMessageButton,
  useBlockedUserIds,
  useChapterRoster,
  useViewerUserId,
  type DmSearchMember,
} from "@repo/hooks";
import {
  buildWhoDirectory,
  peopleToAdd,
} from "@repo/hooks/task-who-picker";
import type { TaskWho } from "@repo/validation";
import { WhoPickerSheet } from "@/components/tasks/who-picker-sheet";
import { MessagesGlyph } from "@/components/tab-glyphs";
import type { WhoReadState } from "@/lib/tasks/use-who-directory";

const NONE: ReadonlySet<string> = new Set();

/**
 * New message on the phone (#6190): the Messages pencil's people picker, as
 * iMessage's, Instagram's and WhatsApp's compose button open a "To:" list.
 * It is the shared Who picker for people only (the rulebook's one people
 * picker), the way Add people uses it: a search, a tick per person, and one
 * button in the footer, "Message" for one person and "Message 3 people" for
 * more. The screen opens the DM or starts the group (`onStart`).
 *
 * Who is offered is `messageableMembers`, the search's rule: the roster, never
 * the viewer, the system actor or a member the viewer blocked, and nobody
 * until the block list is read, which a line says, with Try again once a read
 * failed. Alumni are offered, as the search offers them. Unlike the search,
 * a member the viewer already has a DM with is offered too: picking them
 * opens it, and they can join a group.
 *
 * The screen mounts it when the pencil is tapped, so the roster is read only
 * then; it opens itself, and `onClose` fires once it has closed, however it
 * closed. Picks die with it.
 */
export function NewMessageSheet({
  onStart,
  onClose,
}: {
  /** Everyone picked, in the order they were ticked; one or more. */
  onStart: (members: DmSearchMember[]) => void;
  onClose: () => void;
}) {
  const sheet = useRef<BottomSheetModal>(null);
  const viewerId = useViewerUserId();
  const rosterQuery = useChapterRoster();
  const blockList = useBlockedUserIds();
  const [picked, setPicked] = useState<TaskWho | null>(null);

  useEffect(() => {
    sheet.current?.present();
  }, []);

  const blockListReady = blockList.status === "ready";
  const recipients = useMemo(
    () =>
      messageableMembers({
        roster: (rosterQuery.data ?? []) as DmSearchMember[],
        viewerId,
        blockedIds: blockList.ids,
        blockListReady,
      }),
    [rosterQuery.data, viewerId, blockList.ids, blockListReady],
  );
  // From the roster, the list the search reads, with alumni kept on purpose:
  // the picker leaves them out for a task, but alumni may be messaged.
  const directory = useMemo(
    () =>
      buildWhoDirectory({
        roster: recipients,
        viewerUserId: viewerId,
        alumni: true,
      }),
    [recipients, viewerId],
  );
  const rosterFailed = rosterQuery.isError && rosterQuery.data === undefined;
  const blockListFailed =
    blockList.status === "unavailable" && !blockList.isRetrying;
  const people: WhoReadState =
    rosterQuery.data !== undefined && blockListReady && viewerId !== null
      ? "ready"
      : rosterFailed || blockListFailed
        ? "error"
        : "loading";
  // Why nobody is listed yet, in the search's words: the block list first,
  // since nobody may be offered until it is read.
  const tryAgain = (onPress: () => void) => ({ label: "Try again", onPress });
  const peopleNote =
    people === "ready"
      ? undefined
      : rosterFailed
        ? {
            text: NEW_MESSAGE_MEMBERS_FAILED,
            action: rosterQuery.isFetching
              ? undefined
              : tryAgain(() => void rosterQuery.refetch()),
          }
        : blockListFailed
          ? {
              text: DM_SEARCH_BLOCK_LIST_FAILED,
              action: blockList.isPaused ? undefined : tryAgain(blockList.retry),
            }
          : rosterQuery.data === undefined &&
              rosterQuery.fetchStatus === "paused"
            ? { text: DM_SEARCH_MEMBERS_WAITING }
            : rosterQuery.data !== undefined
              ? { text: DM_SEARCH_CHECKING_BLOCK_LIST }
              : undefined;

  const start = () => {
    const ids = peopleToAdd(picked, directory, NONE);
    if (ids.length === 0 || ids.length > NEW_MESSAGE_MAX_PEOPLE) return;
    const byId = new Map(recipients.map((member) => [member.user_id, member]));
    onStart(
      ids.flatMap((id) => {
        const member = byId.get(id);
        return member ? [member] : [];
      }),
    );
  };

  return (
    <WhoPickerSheet
      ref={sheet}
      title={NEW_MESSAGE_TITLE}
      value={picked}
      onChange={setPicked}
      directory={directory}
      people={people}
      peopleNote={peopleNote}
      sets="ready"
      onDismiss={onClose}
      add={{
        marked: NONE,
        alreadyNote: "",
        label: newMessageButton,
        limit: NEW_MESSAGE_MAX_PEOPLE,
        glyph: (ink) => (
          <MessagesGlyph focused={false} accent={ink} muted={ink} size={16} />
        ),
        onAdd: start,
      }}
    />
  );
}
