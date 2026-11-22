import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  attendanceFromEvent,
  describeAttendance,
  eventLimitsAudience,
  eventSetsRolesApart,
  isModuleEnabled,
} from '@repo/validation';
import { SystemPermissions } from '#domain/constants/permissions';
import type { Event } from '#domain/entities/event.entity';
import type { EventType } from '#domain/entities/event-type.entity';
import {
  ActAudienceResolver,
  type AudienceRole,
} from '../../../act/act-audience';
import { EventService } from '../../../event.service';
import { EventTypeService } from '../../../event-type.service';
import type {
  AgentReadTool,
  AgentToolContext,
  AgentToolResult,
} from '../agent-tool';
import {
  DAY_MS,
  count,
  fitRows,
  found,
  listSourceId,
  liveSource,
  longDay,
  quoted,
} from './chapter-tool-kit';

/** How far back an event's invite list is read, for "like last time". */
const RECENT_BACK_DAYS = 365;
/** Events with their own invite list shown at most. */
const RECENT_EVENTS_MAX = 20;
/** Rows one result holds at most. */
const ROWS_LIMIT = 220;

const input = z.object({
  for_card: z
    .enum(['event', 'task', 'none'])
    .default('none')
    .describe(
      'event: also the event types and who recent events invited. task: also the groups, classes and class years a task can be for. none: tiers and roles only.',
    ),
});
type Args = z.infer<typeof input>;

function roleLine(role: AudienceRole): string {
  return `${role.name} (${count(role.holders, 'member')})`;
}

/**
 * Who the chapter can invite or assign by (#5853): its tiers of roles, each
 * role with how many hold it, and, for an event, its event types and the
 * invite lists of recent events; for a task, its groups. What a model needs
 * before it prepares a card for some members only: the names to use are
 * the chapter's own (`GET /v1/roles`, `GET /v1/role-tiers`, `GET
 * /v1/groups`, `GET /v1/event-types`, `GET /v1/events` as the asker).
 */
@Injectable()
export class ChapterRolesAgentTool implements AgentReadTool<Args> {
  readonly name = 'chapter_roles';
  readonly description =
    "The chapter's tiers of roles (such as its executive board or cabinet), each role in them with how many members hold it, and the roles in no tier. With for_card event, also the chapter's event types and who recent events invited; with for_card task, also its groups. Read it before preparing a card for some members only, and use its names exactly.";
  readonly permission = SystemPermissions.MEMBERS_VIEW;
  readonly module = null;
  readonly effect = 'read' as const;
  readonly input = input;
  readonly reading = 'Reading the chapter roles';

  constructor(
    private readonly audience: ActAudienceResolver,
    private readonly eventTypes: EventTypeService,
    private readonly events: EventService,
  ) {}

  async run(args: Args, context: AgentToolContext): Promise<AgentToolResult> {
    // Event types and events stay out when the chapter has events off, as
    // `GET /v1/events` and `GET /v1/event-types` do.
    const forEvent =
      args.for_card === 'event' &&
      isModuleEnabled(context.enabledModules, 'events');
    const [options, types, recent] = await Promise.all([
      this.audience.options(context.chapterId, {
        groups: args.for_card === 'task',
        holders: true,
      }),
      forEvent
        ? this.eventTypes.list(context.chapterId)
        : Promise.resolve([] as EventType[]),
      forEvent ? this.recentOf(context) : Promise.resolve([]),
    ]);

    const summary = [
      'Tiers, highest first, each with its roles and how many members hold each:',
    ];
    const rows: string[] = [];
    // Kept apart: these are read as the asker, not as any member.
    const eventRows: string[] = [];
    for (const tier of options.tiers) {
      rows.push(
        `- Tier ${quoted(tier.name)}: ${tier.roles.length > 0 ? tier.roles.map(roleLine).join(', ') : 'no roles'}`,
      );
    }
    if (options.tiers.length === 0) rows.push('- The chapter has no tiers.');
    if (options.untiered.length > 0) {
      rows.push(
        `Roles in no tier: ${options.untiered.map(roleLine).join(', ')}`,
      );
    }
    const alumni = [
      ...options.tiers.flatMap((tier) => tier.roles),
      ...options.untiered,
    ].find((role) => role.systemKey === 'ALUMNI');
    if (alumni) {
      rows.push(
        `Alumni (${quoted(alumni.name)}) are left out of an event unless a role or tier of theirs is invited.`,
      );
    }
    if (args.for_card === 'task') {
      rows.push(
        options.groups.length > 0
          ? `Groups, classes and class years: ${options.groups.map((group) => `${group.name} (${count(group.members, 'member')})`).join(', ')}`
          : 'The chapter has no groups.',
      );
    }
    if (forEvent) {
      rows.push(
        types.length > 0
          ? `Event types: ${types.map((type) => `${quoted(type.name)} (${count(type.point_value ?? 0, 'point')}, ${type.is_mandatory ? 'required' : 'optional'} for everyone)`).join(', ')}`
          : 'The chapter has no event types.',
      );
      const names = new Map<string, string>();
      for (const role of [
        ...options.tiers.flatMap((tier) => tier.roles),
        ...options.untiered,
      ]) {
        names.set(role.id, role.name);
      }
      for (const tier of options.tiers) names.set(`tier:${tier.id}`, tier.name);
      eventRows.push(
        recent.length > 0
          ? 'Recent events that did not invite everyone the same way:'
          : 'No recent event invited only some members, or set roles apart.',
      );
      for (const event of recent) {
        eventRows.push(
          `- ${quoted(event.name)} on ${longDay(event.start_time, context.timeZone)}: ${describeAttendance(attendanceFromEvent(event), (id) => names.get(id))}`,
        );
      }
    }

    const shown = fitRows(summary, rows, ROWS_LIMIT);
    const result = found(
      context,
      liveSource({
        id: listSourceId(this.name, args.for_card),
        kind: 'roster',
        audience: { type: 'chapter' },
        title: 'Chapter roles',
        page: 'members',
        lines: [...summary, ...shown],
      }),
      null,
      shown.length < rows.length
        ? `Showing ${shown.length} of ${rows.length} lines.`
        : null,
    );
    if (eventRows.length > 0) {
      // Who recent events invited, read as the asker: a post to a channel
      // checks these as it checks the events tool's.
      result.sources.push(
        liveSource({
          id: listSourceId(this.name, args.for_card, 'events'),
          kind: 'events',
          audience: {
            type: 'events',
            limited: recent.filter(eventLimitsAudience).map(({ id }) => id),
          },
          title: 'Recent invite lists',
          page: 'events',
          lines: eventRows,
        }),
      );
    }
    return result;
  }

  /** Events the asker can see that set roles apart, newest first. */
  private async recentOf(context: AgentToolContext): Promise<Event[]> {
    const events = await this.events.findByChapter(
      context.chapterId,
      context.userId,
      {
        endsAfter: new Date(
          context.now.getTime() - RECENT_BACK_DAYS * DAY_MS,
        ).toISOString(),
        startsBefore: new Date(
          context.now.getTime() + RECENT_BACK_DAYS * DAY_MS,
        ).toISOString(),
      },
    );
    // One line for a series, not one for each meeting of it.
    const seen = new Set<string>();
    return events
      .filter((event) => eventSetsRolesApart(event))
      .sort((a, b) => b.start_time.localeCompare(a.start_time))
      .filter((event) => {
        const key = event.name.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, RECENT_EVENTS_MAX);
  }
}
