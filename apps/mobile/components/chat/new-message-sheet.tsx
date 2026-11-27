import { useEffect, useMemo, useRef, useState } from "react";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  NEW_MESSAGE_MAX_PEOPLE,
  NEW_MESSAGE_TITLE,
  newMessageButton,
  newMessageRecipients,
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
 * Who is offered is `newMessageRecipients`: the roster, never the viewer, the
 * system actor or a member the viewer blocked, and nobody until the block
 * list is read. Alumni are offered, as the search offers them.
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
      newMessageRecipients({
        roster: (rosterQuery.data ?? []) as DmSearchMember[],
        viewerId,
        blockedIds: blockList.ids,
        blockListReady,
      }),
    [rosterQuery.data, viewerId, blockList.ids, blockListReady],
  );
  // From the roster alone: `GET /v1/members` needs `members:view`, which a
  // member may not hold, and would drop alumni, whom a DM may reach.
  const directory = useMemo(
    () => buildWhoDirectory({ roster: recipients, viewerUserId: viewerId }),
    [recipients, viewerId],
  );
  const people: WhoReadState =
    rosterQuery.data !== undefined && blockListReady && viewerId !== null
      ? "ready"
      : (rosterQuery.isError && rosterQuery.data === undefined) ||
          (blockList.status === "unavailable" && !blockList.isRetrying)
        ? "error"
        : "loading";

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
