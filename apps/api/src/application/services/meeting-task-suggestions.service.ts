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
import type { AiSuggestion } from '#domain/entities/ai-suggestion.entity';
import type { MeetingActionItemTaskLink } from '#domain/entities/meeting-action-item-task.entity';
import type { Meeting } from '#domain/entities/meeting.entity';
import {
  MEETING_ACTION_ITEM_TASK_REPOSITORY,
  type IMeetingActionItemTaskRepository,
} from '#domain/repositories/meeting-action-item-task.repository.interface';
import {
  AI_SUGGESTION_REPOSITORY,
  type IAiSuggestionRepository,
} from '#domain/repositories/ai-suggestion.repository.interface';
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
import { assertModuleEnabled, type EnabledModules } from './module-gate';
import { TaskService, type TaskDoneMark } from './task.service';

/**
 * How long a claim on an item may stand empty before another officer takes
 * it over: far longer than making a task takes, so only a claim whose API
 * died between the two writes, or whose single task was deleted, is.
 */
const CLAIM_STALE_MS = 2 * 60 * 1000;

/** What an officer sends to make an action item a task (#6062). */
export interface MakeActionItemTaskInput {
  /** The item's text as the officer saw it. */
  text: string;
  assignee_ids: string[];
  title?: string;
  due_date?: string | null;
}

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
  /**
   * The task, for an officer who manages tasks and so may read it (#6051):
   * its id, for Open task, and who it went to, for the item's owner line.
   * Null for everyone else, who sees only the done mark.
   */
  task: { id: string; who: TaskDoneMark['who'] } | null;
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
   * exception). An officer who manages tasks, who may read every task,
   * also gets each task's id and who it went to (`withTask`, #6051), so the
   * item's row can say who it is for and open it.
   */
  async actionItemTasks(
    chapterId: string,
    meetingId: string,
    viewerId: string,
    options: { withTask?: boolean } = {},
  ): Promise<ActionItemTask[]> {
    // Throws for minutes the viewer may not read, as the minutes' own read.
    const { meeting } = await this.meetings.get(chapterId, meetingId, viewerId);
    const marks = await this.marksFor(chapterId, meeting);
    return options.withTask
      ? marks
      : marks.map((mark) => ({ ...mark, task: null }));
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
   * Makes action item `index` of posted minutes a task when it has no
   * suggestion waiting (#6062; Winston, 2026-11-25: "i want to be able to
   * assign people to tasks from the minutes"). The row's Create task accepts
   * an item's waiting suggestion (#6051); this is the same move for an item
   * with none: one an officer dismissed, one whose suggestion expired, or
   * minutes posted with suggestions off. One item has one task, however it
   * got it:
   *
   * - **Already a task** (accepted through Suggested tasks, or made here
   *   before): nothing is made, and its mark is returned. One accepted as a
   *   task up for grabs, which has no task until it is claimed, or one being
   *   accepted right now, is refused as already a task.
   * - **A suggestion waiting for it:** that suggestion is accepted with these
   *   people and words, as the row would, so it can't make a second task.
   * - **Otherwise** the item is claimed, the task made, and the claim filled
   *   in. Two officers at once: one makes it, the other is told it is one.
   *
   * The caller holds `tasks:manage` with Tasks on; Meetings must be on too,
   * since these are its minutes. The minutes are read under the officer's
   * own rule, and `text` must still be the item at `index`, so an edit to the
   * minutes meanwhile is a conflict rather than the wrong task.
   */
  async makeTask(
    chapterId: string,
    userId: string,
    meetingId: string,
    index: number,
    input: MakeActionItemTaskInput,
    enabledModules: EnabledModules,
  ): Promise<ActionItemTask> {
    // The route's guard can name one module, Tasks; the minutes are
    // Meetings', which a chapter that turned it off has frozen.
    assertModuleEnabled(enabledModules, 'meetings');
    const { meeting } = await this.meetings.get(chapterId, meetingId, userId);
    if (meeting.status !== 'posted') {
      throw new BadRequestException({
        code: 'meeting.action_item.not_posted',
        message: 'Only posted minutes’ action items can become tasks.',
      });
    }
    const item = readMeetingContent(meeting.content).action_items[index];
    const key = actionItemKey(input.text.trim());
    if (!item || actionItemKey(item.text.trim()) !== key) {
      throw new ConflictException({
        code: 'meeting.action_item.changed',
        message: 'These minutes changed. Reload them and try again.',
      });
    }
    // An item of only punctuation names nothing to do, as Suggested tasks
    // never proposes one; and every such item would share one key.
    if (key === actionItemKey('')) {
      throw new BadRequestException({
        code: 'meeting.action_item.empty',
        message: 'This action item has no words to make a task of.',
      });
    }

    const [rows, links] = await this.linksOf(chapterId, meeting.id);
    const existing = await this.markFor(chapterId, key, rows, links);
    if (existing) return { ...existing, index };
    const forItem = rows.filter((row) => row.dedupe_key === key);
    // Accepted without a task to follow (one up for grabs, still open), or
    // being accepted this moment: it is a task already, or about to be.
    if (
      forItem.some(
        (row) => row.status === 'accepted' || row.status === 'accepting',
      )
    ) {
      throw new ConflictException({
        code: 'meeting.action_item.already_task',
        message: 'This action item is already a task.',
      });
    }

    // Worded as its suggested task would be: the item's words, cut to a
    // title, and the whole item as the description when that cut them.
    const itemText = item.text.trim();
    const title = input.title?.trim()
      ? input.title.trim().slice(0, TASK_TITLE_MAX_LENGTH)
      : taskTitleFrom(itemText);
    const description = descriptionFrom(itemText, title);
    // A list, even of one, so every pick is held to the task form's rule
    // that it is an active member.
    const people = [...new Set(input.assignee_ids)];

    // Waiting, and not yet expired (the hourly sweep may not have closed
    // one past its day; accepting that would be refused).
    const nowMs = Date.now();
    const waiting = forItem.find(
      (row) => row.status === 'pending' && Date.parse(row.expires_at) > nowMs,
    );
    if (waiting) {
      await this.suggestions.accept(chapterId, userId, waiting.id, {
        edits: {
          kind: 'task',
          fields: {
            title,
            description,
            ...(people.length === 1
              ? { assignee_id: people[0], assignee_ids: null }
              : { assignee_id: null, assignee_ids: people }),
            audience: null,
            audience_role_id: null,
            audience_group_id: null,
            // Only a day the officer sent: the suggestion keeps its own day
            // and time otherwise.
            ...(input.due_date === undefined
              ? {}
              : { due_date: input.due_date }),
          },
        },
        enabledModules,
      });
      return this.madeMark(chapterId, meeting.id, key, index);
    }

    const claimed = await this.itemTasks.claim(
      {
        meeting_id: meeting.id,
        item_key: key,
        chapter_id: chapterId,
        created_by: userId,
      },
      new Date(nowMs - CLAIM_STALE_MS).toISOString(),
    );
    if (!claimed) {
      throw new ConflictException({
        code: 'meeting.action_item.already_task',
        message: 'Someone just made this a task.',
      });
    }
    let task: { id: string; group_id: string | null };
    try {
      task = await this.tasks.create({
        chapter_id: chapterId,
        title,
        description,
        assignee_id: null,
        assignee_ids: people,
        audience: null,
        audience_role_id: null,
        audience_group_id: null,
        created_by: userId,
        due_date: input.due_date === undefined ? item.due_date : input.due_date,
        due_at: null,
        subtasks: [],
        point_reward: null,
        meeting_id: meeting.id,
      });
    } catch (error) {
      await this.releaseQuietly(chapterId, meeting.id, key);
      throw error;
    }
    try {
      await this.itemTasks.setTask(chapterId, meeting.id, key, task);
    } catch (error) {
      // Unlinked, the task would sit beside an item that reads as free. Take
      // it back so the officer's retry makes it once.
      await this.tasks
        .delete(task.id, chapterId)
        .catch(() => undefined)
        .then(() => this.releaseQuietly(chapterId, meeting.id, key));
      throw error;
    }
    const mark = (await this.tasks.doneMarks(chapterId, [task.id])).get(
      task.id,
    );
    return mark
      ? { index, ...this.toMark(task.id, mark) }
      : this.madeMark(chapterId, meeting.id, key, index);
  }

  /** Gives a claim back without hiding the error that made it go. */
  private async releaseQuietly(
    chapterId: string,
    meetingId: string,
    key: string,
  ): Promise<void> {
    try {
      await this.itemTasks.release(chapterId, meetingId, key);
    } catch {
      // Left empty, the claim is taken over once stale.
    }
  }

  /** The mark of a task just made for an item, read afresh. */
  private async madeMark(
    chapterId: string,
    meetingId: string,
    key: string,
    index: number,
  ): Promise<ActionItemTask> {
    const [rows, links] = await this.linksOf(chapterId, meetingId);
    const mark = await this.markFor(chapterId, key, rows, links);
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
    key: string,
    rows: AiSuggestion[],
    links: MeetingActionItemTaskLink[],
  ): Promise<Omit<ActionItemTask, 'index'> | null> {
    const taskId = (await this.taskIdsByKey(chapterId, rows, links)).get(key);
    if (!taskId) return null;
    const mark = (await this.tasks.doneMarks(chapterId, [taskId])).get(taskId);
    return mark ? this.toMark(taskId, mark) : null;
  }

  private toMark(
    taskId: string,
    mark: TaskDoneMark,
  ): Omit<ActionItemTask, 'index'> {
    return {
      done: mark.done,
      group: mark.group,
      task: { id: taskId, who: mark.who },
    };
  }

  /** Both links of one minutes: suggestions for tasks, and tasks made here. */
  private async linksOf(
    chapterId: string,
    meetingId: string,
  ): Promise<[AiSuggestion[], MeetingActionItemTaskLink[]]> {
    return Promise.all([
      this.suggestionRepo.listKeyedForSource(
        chapterId,
        { type: 'meeting', id: meetingId },
        'task',
      ),
      this.itemTasks.listForMeeting(chapterId, meetingId),
    ]);
  }

  /**
   * Each item key's task, from both links: a suggestion accepted for it, and
   * a task made from the minutes (#6062). An item has only one, so either
   * will do. A link whose copy was deleted follows another copy of its group.
   */
  private async taskIdsByKey(
    chapterId: string,
    rows: AiSuggestion[],
    links: MeetingActionItemTaskLink[],
  ): Promise<Map<string, string>> {
    const taskOf = new Map<string, string>();
    for (const row of rows) {
      if (row.status === 'accepted' && row.result_id && row.dedupe_key) {
        taskOf.set(row.dedupe_key, row.result_id);
      }
    }
    const orphaned = links.flatMap((link) =>
      !link.task_id && link.task_group_id ? [link.task_group_id] : [],
    );
    const copyOf =
      orphaned.length > 0
        ? await this.tasks.copyOfGroups(chapterId, orphaned)
        : new Map<string, string>();
    for (const link of links) {
      const taskId =
        link.task_id ??
        (link.task_group_id ? copyOf.get(link.task_group_id) : undefined);
      if (taskId) taskOf.set(link.item_key, taskId);
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
    const taskOf = await this.taskIdsByKey(
      chapterId,
      ...(await this.linksOf(chapterId, meeting.id)),
    );
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
      return mark
        ? [
            {
              index,
              done: mark.done,
              group: mark.group,
              task: { id: taskId, who: mark.who },
            },
          ]
        : [];
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
