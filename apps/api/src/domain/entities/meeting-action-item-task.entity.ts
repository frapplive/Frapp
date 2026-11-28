/**
 * An action item of posted minutes an officer made into a task from the
 * minutes (`meeting_action_item_tasks`, #6062). An item accepted through
 * Suggested tasks is linked by its suggestion instead; both are keyed by the
 * item's fingerprint (`actionItemKey`), so one item has one task.
 */
export interface MeetingActionItemTaskLink {
  meeting_id: string;
  /** `actionItemKey` of the item's text. */
  item_key: string;
  chapter_id: string;
  /**
   * The task, or for one given to several people the copy it was made
   * with. Null while the task is being made (the claim), and once that copy
   * is deleted.
   */
  task_id: string | null;
  /** The group, for a task given to several people; its copies stand in. */
  task_group_id: string | null;
  created_by: string | null;
  created_at: string;
}
