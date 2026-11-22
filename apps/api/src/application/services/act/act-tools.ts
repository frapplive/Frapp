import { Injectable, Logger } from '@nestjs/common';
import {
  EVENT_DESCRIPTION_MAX_LENGTH,
  EVENT_LOCATION_MAX_LENGTH,
  EVENT_NAME_MAX_LENGTH,
  POINTS_ADJUSTMENT_MAX,
  POINTS_REASON_MAX_LENGTH,
  REPEAT_DEFAULT_COUNT,
  TASK_PEOPLE_MAX,
  TASK_SUBTASK_TITLE_MAX_LENGTH,
  TASK_SUBTASKS_MAX,
  TASK_TITLE_MAX_LENGTH,
  WEEKDAY_CODES,
  attendanceFromEvent,
  attendanceInvitesNobody,
  attendanceToWire,
  describeAttendance,
  eventSetsRolesApart,
  formatRepeatRule,
  isModuleEnabled,
  taskFollowerEntry,
  type EventAttendanceDraft,
  type EventAttendanceStatus,
} from '@repo/validation';
import { SystemPermissions, WILDCARD } from '#domain/constants/permissions';
import type { Event } from '#domain/entities/event.entity';
import type { EventType } from '#domain/entities/event-type.entity';
import {
  localDateIn,
  parseLocalDate,
  parseLocalTime,
  zonedTimeToUtc,
} from '#domain/utils/zoned-time';
import { POINTS_SUGGESTION_MAX_MEMBERS } from '../ai-suggestion-points-kind';
import { TASK_SUGGESTION_DESCRIPTION_MAX_LENGTH } from '../ai-suggestion-task-kind';
import { AttendanceService } from '../attendance.service';
import { EventService } from '../event.service';
import { TaskAudienceService } from '../task-audience.service';
import { reportCaughtFailure } from '../../../infrastructure/observability/report-caught-failure';
import { EventTypeService } from '../event-type.service';
import {
  ActAudienceResolver,
  attendanceKeyOf,
  entriesNamed,
  type AudienceEntry,
} from './act-audience';
import { ActPeopleResolver } from './act-people';
import type { ActInvite, ActPlan, ActRepeat } from './act-prompt';
import type {
  ActDraft,
  ActEventChoice,
  ActNote,
  ActTool,
  ActToolContext,
} from './act-tool';

/**
 * The changes the acting agent ships with (#718): points, a task, an event.
 * Each mirrors one existing route; `act-tool.ts` has the rules.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** How far back "the event everyone came to" is looked for. */
const ATTENDED_EVENT_BACK_DAYS = 14;
/** Events offered when which one is not clear. */
const EVENT_CHOICES_MAX = 8;

function clean(value: string | null | undefined, max: number): string | null {
  const flat = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  return flat.length > max ? flat.slice(0, max).trimEnd() : flat;
}

/** A title as a title: "book the bus" reads "Book the bus" on the card. */
function titled(value: string | null): string | null {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && word !== 'the');
}

/** Every word of `want` begins, or is begun by, a word of `have`. */
function wordsFit(want: string[], have: string[]): boolean {
  return (
    want.length > 0 &&
    want.every((word) =>
      have.some((other) => other.startsWith(word) || word.startsWith(other)),
    )
  );
}

/** "chapter" fits "Chapter Meeting"; "formal" fits "Winter Formal". */
function eventNamed(typed: string, event: Event): boolean {
  return wordsFit(words(typed), words(event.name));
}

/** How far back an earlier event of the same name is looked for. */
const SAME_NAME_BACK_DAYS = 400;

/**
 * The chapter's event type this event is one of: the type of that exact
 * name, or the one type whose name the event's words fit ("Chapter" is a
 * "Chapter meeting"). None when two types fit.
 */
function matchingType(
  name: string,
  types: readonly EventType[],
): EventType | null {
  const lower = name.toLowerCase();
  const exact = types.find((type) => type.name.toLowerCase() === lower);
  if (exact) return exact;
  const typed = words(name);
  // Only the event's words fitting the type's, never the other way:
  // a one-word type such as "Chapter" would otherwise claim "Chapter
  // retreat planning call" and make it required (#5148 review).
  const fits = types.filter((type) => wordsFit(typed, words(type.name)));
  return fits.length === 1 ? fits[0] : null;
}

/** A type the loop named from the chapter's list, as written or near it. */
function typeNamed(
  typed: string,
  types: readonly EventType[],
): EventType | null {
  const lower = typed.trim().toLowerCase();
  const exact = types.filter(
    (type) => type.name.trim().toLowerCase() === lower,
  );
  if (exact.length === 1) return exact[0];
  const near = types.filter(
    (type) => words(type.name).join(' ') === words(typed).join(' '),
  );
  return near.length === 1 ? near[0] : null;
}

/** The one entry a name was resolved to, among those resolved. */
function resolveAudienceName(
  typed: string,
  entries: readonly AudienceEntry[],
): AudienceEntry | null {
  const found = entriesNamed(typed, entries);
  return found.length === 1 ? found[0] : null;
}

/**
 * The rule as a member without `events:update` may set it: nobody
 * required (`EventService.create` moves each required role to optional).
 */
function withoutRequired(draft: EventAttendanceDraft): EventAttendanceDraft {
  const soften = (status: EventAttendanceStatus): EventAttendanceStatus =>
    status === 'required' ? 'optional' : status;
  const everyone = soften(draft.everyone);
  const roles: Record<string, EventAttendanceStatus> = {};
  for (const [key, status] of Object.entries(draft.roles)) {
    const next = soften(status);
    if (next !== everyone) roles[key] = next;
  }
  return { everyone, roles };
}

interface ActDraftInvite {
  draft: EventAttendanceDraft;
}

function holds(context: ActToolContext, permission: string): boolean {
  return (
    context.heldPermissions.has(WILDCARD) ||
    context.heldPermissions.has(permission)
  );
}

function choice(event: Event): ActEventChoice {
  return { id: event.id, name: event.name, start_time: event.start_time };
}

/** Members who came: present, or late. Excused and absent did not. */
const CAME = new Set(['PRESENT', 'LATE']);

/**
 * Give or take away points for members: named ones, the holders of a role,
 * or everyone who came to an event. Mirrors `POST /v1/points/adjust`.
 */
@Injectable()
export class GivePointsActTool implements ActTool {
  readonly name = 'give_points';
  readonly description =
    'Give points to, or take points away from, one or more members. Uses amount, title (the reason, in a few words) and either people, or everyone_who_attended with event_name and date.';
  readonly permission = SystemPermissions.POINTS_ADJUST;
  readonly module = 'points';
  readonly effect = 'propose' as const;
  readonly kind = 'points' as const;

  constructor(
    private readonly people: ActPeopleResolver,
    private readonly events: EventService,
    private readonly attendance: AttendanceService,
  ) {}

  async draft(plan: ActPlan, context: ActToolContext): Promise<ActDraft> {
    const amount = plan.amount;
    if (
      amount === null ||
      !Number.isInteger(amount) ||
      amount === 0 ||
      Math.abs(amount) > POINTS_ADJUSTMENT_MAX
    ) {
      return { status: 'unclear', missing: 'amount' };
    }
    const reason = titled(
      clean(plan.title ?? plan.details, POINTS_REASON_MAX_LENGTH),
    );

    if (plan.everyone_who_attended) {
      if (!this.maySeeAttendance(context)) {
        return { status: 'unclear', missing: 'attendance_access' };
      }
      const found = await this.findAttendedEvent(plan, context);
      if (!found.event) {
        return {
          status: 'needs_event',
          amount,
          // Named after the event once it is picked.
          reason: reason ?? '',
          events: found.choices,
        };
      }
      return this.draftForEvent(found.event, amount, reason, context);
    }

    if (plan.people.length === 0)
      return { status: 'unclear', missing: 'people' };
    if (!reason) return { status: 'unclear', missing: 'reason' };
    const resolved = await this.people.resolve(plan.people, context, {
      roles: true,
    });
    return this.finish(
      amount,
      reason,
      resolved.userIds,
      resolved.notes,
      null,
      context,
    );
  }

  /**
   * The follow-up to `needs_event`: the member picked which event. No model
   * is involved; the amount and the reason are what the first answer carried
   * back, and they are validated again like any proposal.
   */
  async draftFromEvent(
    input: { eventId: string; amount: number; reason: string | null },
    context: ActToolContext,
  ): Promise<ActDraft> {
    if (
      !Number.isInteger(input.amount) ||
      input.amount === 0 ||
      Math.abs(input.amount) > POINTS_ADJUSTMENT_MAX
    ) {
      return { status: 'unclear', missing: 'amount' };
    }
    if (!this.maySeeAttendance(context)) {
      return { status: 'unclear', missing: 'attendance_access' };
    }
    // The same read as `GET /v1/events/:id`: an event of another chapter, or
    // one this member cannot see, is not found.
    const event = await this.events.findById(
      input.eventId,
      context.chapterId,
      context.userId,
    );
    return this.draftForEvent(
      event,
      input.amount,
      clean(input.reason, POINTS_REASON_MAX_LENGTH),
      context,
    );
  }

  /** `GET /v1/events/:eventId/attendance` needs `events:update` and the module. */
  private maySeeAttendance(context: ActToolContext): boolean {
    return (
      holds(context, SystemPermissions.EVENTS_UPDATE) &&
      isModuleEnabled(context.enabledModules, 'events')
    );
  }

  private async draftForEvent(
    event: Event,
    amount: number,
    reason: string | null,
    context: ActToolContext,
  ): Promise<ActDraft> {
    const rows = await this.attendance.getAttendance(
      event.id,
      context.chapterId,
    );
    const came = [
      ...new Set(
        rows.filter((row) => CAME.has(row.status)).map((row) => row.user_id),
      ),
    ];
    if (came.length === 0)
      return { status: 'unclear', missing: 'nobody_attended' };
    return this.finish(
      amount,
      reason ??
        clean(`Attended ${event.name}`, POINTS_REASON_MAX_LENGTH) ??
        'Attended',
      came,
      [],
      event,
      context,
    );
  }

  private finish(
    amount: number,
    reason: string,
    userIds: readonly string[],
    notes: readonly ActNote[],
    event: Event | null,
    context: ActToolContext,
  ): ActDraft {
    // Nobody adjusts their own points (`PointsService.adjustPoints`), so the
    // officer is taken out here and the card says so.
    const targets = userIds.filter((id) => id !== context.userId);
    const out: ActNote[] = [...notes];
    if (targets.length < userIds.length) out.push({ type: 'self_left_out' });
    if (targets.length > POINTS_SUGGESTION_MAX_MEMBERS) {
      return { status: 'unclear', missing: 'too_many_members' };
    }
    const open = out.some(
      (note) =>
        note.type === 'unmatched_name' || note.type === 'ambiguous_name',
    );
    // Nobody at all, and nothing for the officer to fix on the card.
    if (targets.length === 0 && !open) {
      return { status: 'unclear', missing: 'people' };
    }
    return {
      status: 'draft',
      payload: {
        amount,
        reason,
        target_user_ids: targets,
        event_id: event?.id ?? null,
        event_name: event?.name ?? null,
        event_start_time: event?.start_time ?? null,
      },
      notes: out,
    };
  }

  /**
   * The event "everyone who came" refers to, among the events this member
   * can see that have started in the last two weeks. Picked only when what
   * was said leaves one candidate; otherwise the member chooses.
   */
  private async findAttendedEvent(
    plan: ActPlan,
    context: ActToolContext,
  ): Promise<{ event: Event | null; choices: ActEventChoice[] }> {
    const nowIso = context.now.toISOString();
    const events = (
      await this.events.findByChapter(context.chapterId, context.userId, {
        endsAfter: new Date(
          context.now.getTime() - ATTENDED_EVENT_BACK_DAYS * DAY_MS,
        ).toISOString(),
        startsBefore: nowIso,
      })
    )
      .filter((event) => event.start_time <= nowIso)
      .sort((a, b) => b.start_time.localeCompare(a.start_time));

    const date = parseLocalDate(plan.date) ? plan.date : null;
    const name = clean(plan.event_name, EVENT_NAME_MAX_LENGTH);
    const onDate = date
      ? events.filter(
          (event) =>
            localDateIn(new Date(event.start_time), context.timeZone) === date,
        )
      : events;
    const named = name
      ? onDate.filter((event) => eventNamed(name, event))
      : onDate;

    if ((date || name) && named.length === 1) {
      return { event: named[0], choices: [] };
    }
    // A day was named, no event was, and one event was on it: "everyone who
    // came tonight" is that event. A name that matches nothing is never
    // swapped for whatever else was on that day; the member picks.
    if (date && !name && onDate.length === 1) {
      return { event: onDate[0], choices: [] };
    }
    const pool = named.length > 0 ? named : onDate.length > 0 ? onDate : events;
    return {
      event: null,
      choices: pool.slice(0, EVENT_CHOICES_MAX).map(choice),
    };
  }
}

/** A set name that means the whole chapter rather than a role or group. */
const CHAPTER_NAMES = new Set([
  'everyone',
  'everybody',
  'chapter',
  'the chapter',
  'all members',
  'every member',
  'the whole chapter',
  'whole chapter',
]);

/** Who a drafted task is for, in the suggestion payload's own fields. */
interface DraftedTaskWho {
  assignee_id: string | null;
  assignee_ids: string[] | null;
  audience: 'everyone' | 'someone' | null;
  audience_role_id: string | null;
  audience_group_id: string | null;
  audience_tier_id?: string;
}

const NOBODY: DraftedTaskWho = {
  assignee_id: null,
  assignee_ids: null,
  audience: null,
  audience_role_id: null,
  audience_group_id: null,
};

/**
 * Create a task: for one member, several, or a role, tier or group (each
 * of them doing it, or one claiming it), with its points, proof, steps and
 * who it is from (2026-11-22). Mirrors `POST /v1/tasks`.
 */
@Injectable()
export class CreateTaskActTool implements ActTool {
  readonly name = 'create_task';
  readonly description =
    'Create a task for members to do. Uses title, people (the members it is for), date (the day it is due), start_time (the time it is due, when one was said) and details.';
  readonly permission = SystemPermissions.TASKS_MANAGE;
  readonly module = 'tasks';
  readonly effect = 'propose' as const;
  readonly kind = 'task' as const;

  constructor(
    private readonly people: ActPeopleResolver,
    private readonly audience: ActAudienceResolver,
    private readonly taskAudience: TaskAudienceService,
  ) {}

  async draft(plan: ActPlan, context: ActToolContext): Promise<ActDraft> {
    const title = titled(clean(plan.title, TASK_TITLE_MAX_LENGTH));
    if (!title) return { status: 'unclear', missing: 'title' };
    const task = plan.task ?? null;

    const { who, notes } = await this.whoOf(plan, context);

    const dueDate = parseLocalDate(plan.date) ? plan.date : null;
    const dueAt =
      dueDate && parseLocalTime(plan.start_time)
        ? (zonedTimeToUtc(
            dueDate,
            plan.start_time ?? '',
            context.timeZone,
          )?.toISOString() ?? null)
        : null;
    const points =
      task?.points !== null &&
      task?.points !== undefined &&
      Number.isInteger(task.points) &&
      task.points > 0 &&
      task.points <= POINTS_ADJUSTMENT_MAX
        ? task.points
        : null;
    const steps = (task?.steps ?? [])
      .map((step) => clean(step, TASK_SUBTASK_TITLE_MAX_LENGTH))
      .filter((step): step is string => !!step)
      .slice(0, TASK_SUBTASKS_MAX);
    const followedBy = task?.from
      ? await this.fromOf(task.from, context)
      : null;
    return {
      status: 'draft',
      payload: {
        title,
        description: clean(
          plan.details,
          TASK_SUGGESTION_DESCRIPTION_MAX_LENGTH,
        ),
        ...who,
        due_date: dueDate,
        due_at: dueAt,
        subtasks: steps,
        ...(points !== null ? { point_reward: points } : {}),
        ...(task?.proof && task.proof !== 'none'
          ? { proof_kind: task.proof }
          : {}),
        ...(followedBy ? { followed_by: followedBy } : {}),
      },
      notes,
    };
  }

  /**
   * A role, tier or group when one was named, else the people: one is the
   * assignee, several each get a copy or one of them claims it. A name that
   * is none of the chapter's, or could be two, leaves "Who?" for the
   * officer to pick on the card.
   */
  private async whoOf(
    plan: ActPlan,
    context: ActToolContext,
  ): Promise<{ who: DraftedTaskWho; notes: ActNote[] }> {
    const task = plan.task ?? null;
    const audience = task?.who_does === 'one' ? 'someone' : 'everyone';
    const set = task?.for_set?.replace(/\s+/g, ' ').trim();
    if (set) {
      if (CHAPTER_NAMES.has(set.toLowerCase())) {
        return { who: { ...NOBODY, audience }, notes: [] };
      }
      const resolved = await this.audience.resolve([set], context.chapterId, [
        'role',
        'tier',
        'group',
      ]);
      const entry = resolved.entries.length === 1 ? resolved.entries[0] : null;
      if (!entry) return { who: NOBODY, notes: resolved.notes };
      return {
        who: {
          ...NOBODY,
          audience,
          audience_role_id: entry.kind === 'role' ? entry.id : null,
          audience_group_id: entry.kind === 'group' ? entry.id : null,
          ...(entry.kind === 'tier' ? { audience_tier_id: entry.id } : {}),
        },
        notes: [],
      };
    }
    const resolved = await this.people.resolve(plan.people, context, {
      roles: false,
    });
    const ids = resolved.userIds.slice(0, TASK_PEOPLE_MAX);
    if (ids.length === 0) return { who: NOBODY, notes: resolved.notes };
    if (ids.length === 1) {
      return { who: { ...NOBODY, assignee_id: ids[0] }, notes: resolved.notes };
    }
    return {
      who: {
        ...NOBODY,
        assignee_ids: ids,
        audience: task?.who_does === 'one' ? 'someone' : null,
      },
      notes: resolved.notes,
    };
  }

  /**
   * "From the Recruitment Committee": a tier, role or group the member
   * asking is in, as the task form offers it (`TaskAudienceService
   * .checkedFollower`). Any other name is left off; the officer can still
   * set it on the card's Edit.
   */
  private async fromOf(
    typed: string,
    context: ActToolContext,
  ): Promise<string | null> {
    const resolved = await this.audience.resolve([typed], context.chapterId, [
      'role',
      'tier',
      'group',
    ]);
    if (resolved.entries.length !== 1) return null;
    const entry = resolved.entries[0];
    const stored = taskFollowerEntry(entry.kind, entry.id);
    const mine = await this.taskAudience.followEntriesOf(
      context.chapterId,
      context.userId,
    );
    return mine.includes(stored) ? stored : null;
  }
}

/**
 * The repeat rule for a proposed series, in the event form's own format and
 * with its own default lengths (`REPEAT_DEFAULT_COUNT`): what the form's
 * Weekly, Weekly every 2, and Monthly make when the officer changes nothing
 * else (13, 13 and 7 meetings). It keeps the wall clock of `timeZone`, the member's, and
 * meets on the first meeting's weekday or day of the month. How long it runs
 * is the form's to change (the card's Edit).
 */
export function proposedRepeatRule(
  repeats: ActRepeat,
  date: string,
  timeZone: string,
): string {
  // The local day's weekday and day of the month, read from the date itself.
  const [year, month, day] = date.split('-').map(Number);
  const weekday =
    WEEKDAY_CODES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const base = { nthWeekday: null, timeZone };
  if (repeats === 'monthly') {
    return formatRepeatRule({
      ...base,
      freq: 'MONTHLY',
      interval: 1,
      byDay: [],
      monthDay: day,
      end: { kind: 'count', count: REPEAT_DEFAULT_COUNT.MONTHLY },
    });
  }
  const everyOther = repeats === 'every_other_week';
  return formatRepeatRule({
    ...base,
    freq: 'WEEKLY',
    interval: everyOther ? 2 : 1,
    byDay: [weekday],
    monthDay: null,
    end: { kind: 'count', count: REPEAT_DEFAULT_COUNT.WEEKLY },
  });
}

/** Put one event, or a series, on the calendar. Mirrors `POST /v1/events`. */
@Injectable()
export class CreateEventActTool implements ActTool {
  readonly name = 'create_event';
  readonly description =
    'Put one event, or a repeating series, on the chapter calendar. Uses title (its name), date (its first day), start_time, end_time, location, details, required (whether members must attend), amount (the points it is worth, when said) and repeats (how often it happens again, when said).';
  readonly permission = SystemPermissions.EVENTS_CREATE;
  readonly module = 'events';
  readonly effect = 'propose' as const;
  readonly kind = 'new_event' as const;

  private readonly logger = new Logger(CreateEventActTool.name);

  constructor(
    private readonly events: EventService,
    private readonly eventTypes: EventTypeService,
    private readonly audience: ActAudienceResolver,
  ) {}

  async draft(plan: ActPlan, context: ActToolContext): Promise<ActDraft> {
    const name = titled(clean(plan.title, EVENT_NAME_MAX_LENGTH));
    if (!name) return { status: 'unclear', missing: 'title' };
    if (!plan.date || !parseLocalDate(plan.date)) {
      return { status: 'unclear', missing: 'date' };
    }
    const start = plan.start_time
      ? zonedTimeToUtc(plan.date, plan.start_time, context.timeZone)
      : null;
    if (!start) return { status: 'unclear', missing: 'time' };
    let end = plan.end_time
      ? zonedTimeToUtc(plan.date, plan.end_time, context.timeZone)
      : null;
    // No end said: an hour. An end before the start ("9 to 1") is the next day.
    if (!end) end = new Date(start.getTime() + HOUR_MS);
    else if (end <= start) end = new Date(end.getTime() + DAY_MS);

    const said =
      plan.amount !== null &&
      Number.isInteger(plan.amount) &&
      plan.amount >= 0 &&
      plan.amount <= POINTS_ADJUSTMENT_MAX
        ? plan.amount
        : null;
    // Only a member who may change events sets an event's points or makes
    // it required; anyone else's is made with none and optional
    // (`EventService.create`), so their card says so and asks nothing.
    const setsRequirements = holds(context, SystemPermissions.EVENTS_UPDATE);
    const types = await this.typesOf(context);
    let type: EventType | null;
    if (plan.event_type) {
      // Named by the loop from the chapter's own list: a name that is not
      // one is sent back, never matched to something else.
      const named = typeNamed(plan.event_type, types ?? []);
      if (!named && types !== null) {
        return { status: 'unclear', missing: 'event_type' };
      }
      type = named;
    } else {
      type = types ? matchingType(name, types) : null;
    }

    let invite: ActDraftInvite | null = null;
    if (plan.invite) {
      const read = await this.inviteOf(plan.invite, type, context);
      if (!read) return { status: 'unclear', missing: 'invitees' };
      invite = read;
    }
    // Points the member did not say are copied from the chapter's own
    // records, and the card says from where (Paul, 2026-11-16: never "the
    // chapter's usual amount"). With nothing to copy they stay empty, and
    // the card asks for them before it can be confirmed. Who is invited,
    // when nobody chose, is copied the same way from the last event of the
    // same name (#5853: last year's reception invites last year's list).
    const earlier =
      setsRequirements && ((said === null && !type) || !invite)
        ? await this.earlierNamed(name, context)
        : null;
    const points = setsRequirements
      ? (said ?? type?.point_value ?? earlier?.point_value ?? null)
      : 0;
    const pointsFrom =
      !setsRequirements || said !== null
        ? null
        : type
          ? { kind: 'type' as const, name: type.name }
          : earlier
            ? { kind: 'event' as const, name: earlier.name }
            : null;

    let attendance: EventAttendanceDraft;
    let attendanceFrom: { kind: 'event'; name: string } | null = null;
    if (invite) {
      attendance = invite.draft;
    } else if (earlier && eventSetsRolesApart(earlier)) {
      attendance = attendanceFromEvent(earlier);
      attendanceFrom = { kind: 'event', name: earlier.name };
    } else {
      // Attendance not said follows the type, as the event form does.
      attendance = {
        everyone:
          (plan.required ?? type?.is_mandatory ?? false)
            ? 'required'
            : 'optional',
        roles: {},
      };
    }
    if (!setsRequirements) attendance = withoutRequired(attendance);
    if (attendanceInvitesNobody(attendanceToWire(attendance))) {
      return { status: 'unclear', missing: 'invitees' };
    }
    const setApart = Object.keys(attendance.roles).length > 0;
    const names = setApart ? await this.entryNames(context) : null;
    return {
      status: 'draft',
      payload: {
        name,
        description: clean(plan.details, EVENT_DESCRIPTION_MAX_LENGTH),
        location: clean(plan.location, EVENT_LOCATION_MAX_LENGTH),
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        point_value: points,
        points_from: pointsFrom,
        event_type_id: type?.id ?? null,
        is_mandatory: attendance.everyone === 'required',
        attendance,
        attendance_line: describeAttendance(attendance, (id) => names?.get(id)),
        attendance_from: attendanceFrom,
        recurrence_rule: plan.repeats
          ? proposedRepeatRule(plan.repeats, plan.date, context.timeZone)
          : null,
      },
      notes: [],
    };
  }

  /**
   * The invite list the loop wrote, as the chapter's roles and tiers. Null
   * when a name is none of them, or could be two: the model is told to read
   * the list and try again, rather than a card guessing.
   */
  private async inviteOf(
    invite: ActInvite,
    type: EventType | null,
    context: ActToolContext,
  ): Promise<ActDraftInvite | null> {
    const byStatus = [
      ['not_invited', invite.not_invited],
      ['optional', invite.optional],
      ['required', invite.required],
    ] as const;
    const all = byStatus.flatMap(([, names]) => names);
    const resolved = await this.audience.resolve(all, context.chapterId, [
      'role',
      'tier',
    ]);
    if (resolved.notes.length > 0) return null;
    const everyone: EventAttendanceStatus =
      invite.everyone_else ?? (type?.is_mandatory ? 'required' : 'optional');
    const roles: Record<string, EventAttendanceStatus> = {};
    // Lowest first, so a name given twice keeps the stronger status.
    for (const [status, names] of byStatus) {
      for (const typed of names) {
        const one = resolveAudienceName(typed, resolved.entries);
        const key = one ? attendanceKeyOf(one) : null;
        if (key && status !== everyone) roles[key] = status;
      }
    }
    return { draft: { everyone, roles } };
  }

  /** Each role and tier by its attendance key, for the card's line. */
  private async entryNames(
    context: ActToolContext,
  ): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    try {
      const options = await this.audience.options(context.chapterId, {
        groups: false,
      });
      for (const tier of options.tiers) {
        names.set(`tier:${tier.id}`, tier.name);
        for (const role of tier.roles) names.set(role.id, role.name);
      }
      for (const role of options.untiered) names.set(role.id, role.name);
    } catch (error) {
      reportCaughtFailure(this.logger, {
        level: 'warning',
        site: 'ask-event-invite-names',
        message: `Ask could not read role names for chapter ${context.chapterId}`,
        error,
      });
    }
    return names;
  }

  /** The chapter's event types, or null when they cannot be read. */
  private async typesOf(context: ActToolContext): Promise<EventType[] | null> {
    try {
      return await this.eventTypes.list(context.chapterId);
    } catch (error) {
      reportCaughtFailure(this.logger, {
        level: 'warning',
        site: 'ask-event-type-match',
        message: `Ask could not read event types for chapter ${context.chapterId}; the card asks for points instead`,
        error,
      });
      return null;
    }
  }

  /**
   * The latest event this member can see with the same name, in the last
   * half year, for its points.
   */
  private async earlierNamed(
    name: string,
    context: ActToolContext,
  ): Promise<Event | null> {
    const lower = name.toLowerCase();
    const nowIso = context.now.toISOString();
    let events: Event[];
    try {
      events = await this.events.findByChapter(
        context.chapterId,
        context.userId,
        {
          endsAfter: new Date(
            context.now.getTime() - SAME_NAME_BACK_DAYS * DAY_MS,
          ).toISOString(),
          startsBefore: nowIso,
        },
      );
    } catch (error) {
      reportCaughtFailure(this.logger, {
        level: 'warning',
        site: 'ask-event-same-name',
        message: `Ask could not read recent events for chapter ${context.chapterId}; the card asks for points instead`,
        error,
      });
      return null;
    }
    return (
      events
        .filter((event) => event.name.trim().toLowerCase() === lower)
        .sort((a, b) => b.start_time.localeCompare(a.start_time))[0] ?? null
    );
  }
}
