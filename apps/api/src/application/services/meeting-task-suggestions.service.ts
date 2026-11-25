import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';
import {
  readMeetingContent,
  TASK_TITLE_MAX_LENGTH,
  taskTitleFrom,
} from '@repo/validation';
import type { Meeting } from '#domain/entities/meeting.entity';
import {
  AI_SUGGESTION_REPOSITORY,
  type IAiSuggestionRepository,
} from '#domain/repositories/ai-suggestion.repository.interface';
import {
  MEETING_ACTION_ITEM_TASK_REPOSITORY,
  type IMeetingActionItemTaskRepository,
} from '#domain/repositories/meeting-action-item-task.repository.interface';
import type { TaskStatus } from '#domain/entities/task.entity';
import { isAiEnabled } from '#domain/utils/ai-enabled';
import {
  actionItemKey,
  actionItemsText,
  descriptionFrom,
  taskProposalsFromMinutes,
} from '#domain/utils/minutes-task-proposals';
import { AiConsentService } from './ai/ai-consent.service';
import {
  AiSuggestionService,
  type ReconcileAiSuggestionsResult,
} from './ai-suggestion.service';
import { MeetingService } from './meeting.service';
import type { EnabledModules } from './module-gate';
import { TaskService } from './task.service';

/**
 * How long a claim on an item may stand empty before another officer takes
 * it over: far longer than making a task takes, so only a claim whose API
 * died between the two writes is.
 */
const CLAIM_STALE_MS = 2 * 60 * 1000;

/**
 * Where an action item of posted minutes stands as a task: the minutes'
 * checkbox (Paul, 2026-11-18: "action items should be like checkboxes that
 * show updates as the tasks are actually checked off").
 */
export interface ActionItemTask {
  /** The action item's place in the minutes' list, from 0. */
  index: number;
  /** Marked done: by its member, or every copy of a task for everyone. */
  done: boolean;
  /** A task for everyone: how many of its copies are done. */
  group: { done: number; total: number } | null;
  /** Its display status, a group's copies read as one (#6062). */
  status: TaskStatus;
  /** Who has it: its member, or every copy's. */
  assignee_ids: string[];
  /** The task's id. The controller shows it only to a task manager. */
  task_id: string;
}

/** What an officer sends to make an action item a task (#6062). */
export interface MakeActionItemTaskInput {
  /** The item's text as the officer saw it. */
  text: string;
  assignee_ids: string[];
  title?: string;
  due_date?: string | null;
}

/** One posted minutes' open action items (`seriesOpenActionItems`). */
export interface SeriesOpenActionItems {
  meeting_id: string;
  event_start_time: string;
  items: {
    /** The item's place in its minutes' list, from 0. */
    index: number;
    text: string;
    owner_user_id: string | null;
    due_date: string | null;
    group: ActionItemTask['group'];
  }[];
}

/**
 * Suggested tasks from minutes (#4313, `spec/behavior/meetings.md`
 * § Suggested tasks). When minutes are posted, each action item becomes a
 * suggested task an officer accepts, changes or dismisses; nothing is a task
 * until they do (ADR-28 decision 11).
 *
 * - **Posted minutes only.** A draft is its author's, and its action items
 *   are still being written.
 * - **No model call** (`minutes-task-proposals.ts` says why), so hand-written
 *   minutes get suggestions exactly as drafted ones do, and there is no
 *   member's Yes to ask for: nothing leaves Frapp.
 * - **Off unless** the server has AI on and the president has meeting notes
 *   on, like every other AI entry point on the minutes.
 * - **Follows edits.** Saving posted minutes again takes back a waiting
 *   suggestion whose action item was removed, replaces one whose owner or
 *   day changed, and proposes an item that is new. An item already accepted
 *   or dismissed is never proposed again.
 * - **One push**, when the minutes post, to the officer who posted them, and
 *   only if they could accept one. Edits afterwards tell nobody, as they tell
 *   nobody about the minutes.
 */
@Injectable()
export class MeetingTaskSuggestionsService implements OnModuleInit {
  constructor(
    private readonly meetings: MeetingService,
    private readonly suggestions: AiSuggestionService,
    private readonly consent: AiConsentService,
    private readonly tasks: TaskService,
    @Inject(AI_SUGGESTION_REPOSITORY)
    private readonly suggestionRepo: IAiSuggestionRepository,
    @Inject(MEETING_ACTION_ITEM_TASK_REPOSITORY)
    private readonly itemTasks: IMeetingActionItemTaskRepository,
  ) {}

  /**
   * The tasks the action items of these minutes became: one entry per item
   * an officer created as a task that still exists, with whether it is done.
   * An item matches its suggestion by the same fingerprint that keeps it
   * from being suggested twice, so an item whose case, punctuation or
   * spacing is tidied after posting keeps its task; one reworded is a new
   * item to Frapp and loses its box. Only the done mark is told, never the task's own fields, because a
   * member may read the minutes without being able to read the task, and the
   * minutes already say who owes it (`tasks.md` § Visibility records this
   * exception).
   */
  async actionItemTasks(
    chapterId: string,
    meetingId: string,
    viewerId: string,
  ): Promise<ActionItemTask[]> {
    // Throws for minutes the viewer may not read, as the minutes' own read.
    const { meeting } = await this.meetings.get(chapterId, meetingId, viewerId);
    return this.marksFor(chapterId, meeting);
  }

  /**
   * The action items still open across one repeating meeting's posted
   * minutes, newest meeting first (#5482; Paul's pick, 2026-11-18: done comes
   * from Tasks). An item is open until the task it became is done; one
   * nobody made a task of stays open. Two items that read the same share one
   * task, so a later copy closes with the first. Only minutes the viewer may
   * read are looked at (the Minutes list's own read), and each minutes'
   * content and marks are read together, so they always agree.
   */
  async seriesOpenActionItems(
    chapterId: string,
    viewerId: string,
    seriesKey: string,
  ): Promise<SeriesOpenActionItems[]> {
    const { rows, facts } = await this.meetings.listWithFacts(
      chapterId,
      viewerId,
    );
    const series = rows.filter(
      (row) =>
        row.status === 'posted' && facts.get(row.id)?.series_key === seriesKey,
    );
    const result: SeriesOpenActionItems[] = [];
    for (const meeting of series) {
      const items = readMeetingContent(meeting.content).action_items;
      if (items.length === 0) continue;
      const marks = new Map(
        (await this.marksFor(chapterId, meeting)).map((mark) => [
          mark.index,
          mark,
        ]),
      );
      // A later copy of an item follows the first copy's task.
      const firstOf = new Map<string, number>();
      const open = items.flatMap((item, index) => {
        const key = actionItemKey(item.text.trim());
        const first = firstOf.get(key) ?? index;
        if (!firstOf.has(key)) firstOf.set(key, index);
        const mark = marks.get(first);
        if (mark?.done) return [];
        return [
          {
            index,
            text: item.text,
            owner_user_id: item.owner_user_id,
            due_date: item.due_date,
            group: mark?.group ?? null,
          },
        ];
      });
      if (open.length > 0) {
        result.push({
          meeting_id: meeting.id,
          event_start_time: meeting.event_start_time,
          items: open,
        });
      }
    }
    return result;
  }

  /**
   * Makes action item `index` of posted minutes a task, from the minutes
   * (#6062; Winston, 2026-11-25: "i want to be able to assign people to
   * tasks from the minutes"). One item has one task, however it got it:
   *
   * - **Already a task** (accepted through Suggested tasks, or made here
   *   before): nothing is made, and its mark is returned.
   * - **A suggestion waiting for it:** that suggestion is accepted with these
   *   people and words, so it can't later make a second task.
   * - **Otherwise** the item is claimed, the task made, and the claim filled
   *   in. Two officers at once: one makes it, the other is told it is one.
   *
   * The caller holds `tasks:manage`; the minutes are read under the
   * officer's own rule, and `text` must still be the item at `index`, so an
   * edit to the minutes meanwhile is a conflict rather than the wrong task.
   */
  async makeTask(
    chapterId: string,
    userId: string,
    meetingId: string,
    index: number,
    input: MakeActionItemTaskInput,
    enabledModules: EnabledModules,
  ): Promise<ActionItemTask> {
    const { meeting } = await this.meetings.get(chapterId, meetingId, userId);
    if (meeting.status !== 'posted') {
      throw new BadRequestException({
        code: 'meeting.action_item.not_posted',
        message: 'Only posted minutes’ action items can become tasks.',
      });
    }
    const items = readMeetingContent(meeting.content).action_items;
    const item = items[index];
    const key = actionItemKey(input.text.trim());
    if (!item || actionItemKey(item.text.trim()) !== key) {
      throw new ConflictException({
        code: 'meeting.action_item.changed',
        message: 'These minutes changed. Reload them and try again.',
      });
    }
    const existing = await this.markFor(chapterId, meeting, key);
    if (existing) return { ...existing, index };

    // Worded as its suggested task would be: the item's words, cut to a
    // title, and the whole item as the description when that cut them.
    const itemText = item.text.trim();
    const title = input.title?.trim()
      ? input.title.trim().slice(0, TASK_TITLE_MAX_LENGTH)
      : taskTitleFrom(itemText);
    const description = descriptionFrom(itemText, title);
    const dueDate =
      input.due_date === undefined ? item.due_date : input.due_date;
    const people = [...new Set(input.assignee_ids)];
    const who =
      people.length === 1
        ? { assignee_id: people[0], assignee_ids: null }
        : { assignee_id: null, assignee_ids: people };

    const waiting = (
      await this.suggestionRepo.listKeyedForSource(
        chapterId,
        { type: 'meeting', id: meeting.id },
        'task',
      )
    ).find((row) => row.dedupe_key === key && row.status === 'pending');
    if (waiting) {
      await this.suggestions.accept(chapterId, userId, waiting.id, {
        edits: {
          kind: 'task',
          fields: {
            title,
            description,
            ...who,
            audience: null,
            audience_role_id: null,
            audience_group_id: null,
            due_date: dueDate,
          },
        },
        enabledModules,
      });
      return this.madeMark(chapterId, meeting, key, index);
    }

    const claimed = await this.itemTasks.claim(
      {
        meeting_id: meeting.id,
        item_key: key,
        chapter_id: chapterId,
        created_by: userId,
      },
      new Date(Date.now() - CLAIM_STALE_MS).toISOString(),
    );
    if (!claimed) {
      throw new ConflictException({
        code: 'meeting.action_item.already_task',
        message: 'Someone just made this a task.',
      });
    }
    let taskId: string;
    try {
      const task = await this.tasks.create({
        chapter_id: chapterId,
        title,
        description,
        ...who,
        audience: null,
        audience_role_id: null,
        audience_group_id: null,
        created_by: userId,
        due_date: dueDate,
        due_at: null,
        subtasks: [],
        point_reward: null,
        meeting_id: meeting.id,
      });
      taskId = task.id;
    } catch (error) {
      await this.itemTasks.release(chapterId, meeting.id, key);
      throw error;
    }
    await this.itemTasks.setTask(chapterId, meeting.id, key, taskId);
    return this.madeMark(chapterId, meeting, key, index);
  }

  /** The mark of a task just made for an item. */
  private async madeMark(
    chapterId: string,
    meeting: Meeting,
    key: string,
    index: number,
  ): Promise<ActionItemTask> {
    const mark = await this.markFor(chapterId, meeting, key);
    if (!mark) {
      // Deleted in the moment between: the item is free again.
      throw new ConflictException({
        code: 'meeting.action_item.changed',
        message: 'These minutes changed. Reload them and try again.',
      });
    }
    return { ...mark, index };
  }

  /** The task one item key has, as a mark at no particular index. */
  private async markFor(
    chapterId: string,
    meeting: Meeting,
    key: string,
  ): Promise<Omit<ActionItemTask, 'index'> | null> {
    const taskId = (await this.taskIdsByKey(chapterId, meeting.id)).get(key);
    if (!taskId) return null;
    const mark = (await this.tasks.doneMarks(chapterId, [taskId])).get(taskId);
    return mark ? { ...mark, task_id: taskId } : null;
  }

  /**
   * Each item key's task, from both links: a suggestion accepted for it, and
   * a task made from the minutes. An item has only one, so either will do.
   */
  private async taskIdsByKey(
    chapterId: string,
    meetingId: string,
  ): Promise<Map<string, string>> {
    const [rows, made] = await Promise.all([
      this.suggestionRepo.listKeyedForSource(
        chapterId,
        { type: 'meeting', id: meetingId },
        'task',
      ),
      this.itemTasks.listForMeeting(chapterId, meetingId),
    ]);
    const taskOf = new Map<string, string>();
    for (const row of rows) {
      if (row.status === 'accepted' && row.result_id && row.dedupe_key) {
        taskOf.set(row.dedupe_key, row.result_id);
      }
    }
    for (const row of made) {
      if (row.task_id) taskOf.set(row.item_key, row.task_id);
    }
    return taskOf;
  }

  /** `actionItemTasks` for minutes already read under the viewer's rule. */
  private async marksFor(
    chapterId: string,
    meeting: Meeting,
  ): Promise<ActionItemTask[]> {
    if (meeting.status !== 'posted') return [];
    const items = readMeetingContent(meeting.content).action_items;
    if (items.length === 0) return [];
    const taskOf = await this.taskIdsByKey(chapterId, meeting.id);
    // Two items that read the same were one suggestion, so one task: it
    // follows the first of them.
    const seen = new Set<string>();
    const wanted = items.flatMap((item, index) => {
      const key = actionItemKey(item.text.trim());
      const taskId = taskOf.get(key);
      if (!taskId || seen.has(key)) return [];
      seen.add(key);
      return [{ index, taskId }];
    });
    if (wanted.length === 0) return [];
    const marks = await this.tasks.doneMarks(
      chapterId,
      wanted.map((entry) => entry.taskId),
    );
    // A task deleted since leaves its item with nothing to follow.
    return wanted.flatMap(({ index, taskId }) => {
      const mark = marks.get(taskId);
      return mark ? [{ index, ...mark, task_id: taskId }] : [];
    });
  }

  onModuleInit(): void {
    this.meetings.onPostedMinutesSaved(async (meeting, change) => {
      await this.sync(meeting, change);
    });
  }

  /**
   * The minutes' task proposals but the items an officer already made a
   * task from the minutes (#6062), so none is suggested a second time.
   */
  private async unmadeProposals(
    meeting: Meeting,
  ): Promise<ReturnType<typeof taskProposalsFromMinutes>> {
    const proposals = taskProposalsFromMinutes(meeting.content);
    if (proposals.length === 0) return proposals;
    const made = new Set(
      (await this.itemTasks.listForMeeting(meeting.chapter_id, meeting.id)).map(
        (row) => row.item_key,
      ),
    );
    return proposals.filter((proposal) => !made.has(proposal.dedupeKey));
  }

  async sync(
    meeting: Meeting,
    change: { reason: 'posted' | 'edited'; actorId: string },
  ): Promise<ReconcileAiSuggestionsResult | null> {
    if (meeting.status !== 'posted' || !isAiEnabled()) return null;
    // With the chapter's switch off nothing is proposed, and what was
    // waiting from before is taken back on this save: a list nobody is
    // keeping up with the minutes shouldn't be acceptable.
    const on = await this.consent.chapterSwitchOn(
      meeting.chapter_id,
      'meeting_notes',
    );
    return this.suggestions.reconcileSource({
      chapterId: meeting.chapter_id,
      requestedFor: change.actorId,
      source: {
        type: 'meeting',
        id: meeting.id,
        title: meeting.event_name,
        text: actionItemsText(meeting.content),
      },
      kind: 'task',
      proposals: on ? await this.unmadeProposals(meeting) : [],
      notify: on && change.reason === 'posted' ? [change.actorId] : [],
    });
  }
}
