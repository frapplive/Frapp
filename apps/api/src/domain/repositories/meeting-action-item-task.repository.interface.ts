import type { MeetingActionItemTaskLink } from '../entities/meeting-action-item-task.entity';

export const MEETING_ACTION_ITEM_TASK_REPOSITORY =
  'MEETING_ACTION_ITEM_TASK_REPOSITORY';

/**
 * `meeting_action_item_tasks` (#6062): action items made into tasks from the
 * minutes. Chapter-first on every read and write.
 */
export interface IMeetingActionItemTaskRepository {
  /**
   * Claims an item before its task is made. False when the item already has
   * a row (made, or being made by another officer); a claim left empty since
   * before `staleBefore` is taken over.
   */
  claim(
    row: Pick<
      MeetingActionItemTaskLink,
      'meeting_id' | 'item_key' | 'chapter_id' | 'created_by'
    >,
    staleBefore: string,
  ): Promise<boolean>;

  /** Fills in a claim with the task made for it, and its group if any. */
  setTask(
    chapterId: string,
    meetingId: string,
    itemKey: string,
    task: { id: string; group_id: string | null },
  ): Promise<void>;

  /** Gives back a claim whose task could not be made. */
  release(chapterId: string, meetingId: string, itemKey: string): Promise<void>;

  /** The rows of these minutes, claims included. */
  listForMeeting(
    chapterId: string,
    meetingId: string,
  ): Promise<MeetingActionItemTaskLink[]>;
}
