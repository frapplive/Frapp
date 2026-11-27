import { useRef, useState } from "react";
import { rushStagesProblem } from "@repo/validation";
import {
  draftsOf,
  stagesBody,
  withSavedIds,
  type StageDraft,
} from "./rush-stage-drafts";
import type { RushStage, useSaveRushStages } from "./use-rush-pipeline";

/**
 * The recruitment stages editor's state and saves (`spec/behavior/rush.md`
 * § Stages), shared by web's Recruitment page and the phone's Stages screen
 * (#6030) so the two save the same way. Settings save on their own (rulebook
 * § 9): every change sends the whole list, as `PUT /v1/rush/stages` takes it,
 * once `rushStagesProblem` (the check the API runs) passes; a change it
 * refuses stays on screen with `problem`, and nothing is sent until it is
 * fixed. The caller passes the save (`useSaveRushStages()`, from its app's
 * `@repo/hooks` import) and says how a failed one reads (`onError`): a toast
 * on web, a line on the phone.
 */
export function useRushStageEditor(
  stages: readonly RushStage[],
  save: Pick<ReturnType<typeof useSaveRushStages>, "mutate">,
  onError: (error: unknown) => void,
) {
  // The edit in hand and the server list it was made against: once the
  // server's list moves on (the save landed and refreshed) and nothing is
  // still being saved, the server's list is the truth.
  const [edit, setEdit] = useState<{
    basis: readonly RushStage[];
    drafts: StageDraft[];
  } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // One save at a time. A change made while one is out waits here, newest
  // wins, and goes once that save returns, with the ids it gave any stage
  // just added: sent again without its id, a new stage would be added twice,
  // or the API would refuse the list for missing it.
  const [saving, setSaving] = useState(false);
  const queued = useRef<StageDraft[] | null>(null);
  const drafts =
    edit && (edit.basis === stages || saving) ? edit.drafts : draftsOf(stages);

  function send(next: StageDraft[]) {
    setSaving(true);
    save.mutate(stagesBody(next), {
      onSuccess: (saved) => {
        const waiting = queued.current;
        queued.current = null;
        if (!waiting) {
          setSaving(false);
          return;
        }
        const withIds = withSavedIds(waiting, next, saved);
        setEdit({ basis: stages, drafts: withIds });
        send(withIds);
      },
      onError: (error) => {
        queued.current = null;
        setSaving(false);
        setEdit(null);
        onError(error);
      },
    });
  }

  /** The list as the officer changed it: shown at once, saved when it passes. */
  function change(next: StageDraft[]) {
    setEdit({ basis: stages, drafts: next });
    const refused = rushStagesProblem(next);
    setProblem(refused);
    if (refused) return;
    if (saving) {
      queued.current = next;
      return;
    }
    send(next);
  }

  return { drafts, problem, change };
}
