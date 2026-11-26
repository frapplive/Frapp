import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { SystemPermissions } from '#domain/constants/permissions';
import { MemberService } from '../../../member.service';
import { ServiceEntryService } from '../../../service-entry.service';
import type {
  AgentReadTool,
  AgentToolContext,
  AgentToolResult,
} from '../agent-tool';
import {
  count,
  dayArg,
  duration,
  fitRows,
  found,
  holds,
  listSourceId,
  liveSource,
  longDay,
  nothing,
  People,
} from './chapter-tool-kit';
import { serviceDays } from './service-days';

const BACK_DAYS = 30;
const MEMBERS_LIMIT = 250;
/** The waiting entries one read lists; the count above them is whole. */
const WAITING_LIMIT = 40;

const input = z.object({
  from: dayArg(
    'First day of service to count, YYYY-MM-DD. Empty for thirty days back.',
  ),
  to: dayArg('Last day of service to count, YYYY-MM-DD. Empty for today.'),
});
type Args = z.infer<typeof input>;

/**
 * The chapter's approved service in a range of days: `GET
 * /v1/service-entries/leaderboard`, which every member sees, set beside the
 * roster (`GET /v1/members`) so the members with none are named too.
 *
 * A member who approves service (`service:approve`) is also shown the
 * approval queue they see in the app (`GET /v1/service-entries?status=
 * PENDING`, the read behind Activity's queue): who logged what and is
 * waiting on them. What a member wrote
 * about the service, and their proof, stay on that page.
 */
@Injectable()
export class ServiceHoursAgentTool implements AgentReadTool<Args> {
  readonly name = 'service_hours';
  readonly description =
    "Approved service hours across the chapter in a range of days: each member's total, the chapter's total, and which active members have none. Use it for who has or has not logged service. For a member who approves service it also lists every entry waiting for approval, whatever its day: use it for which hours are waiting on them. Defaults to the last thirty days.";
  readonly permission = SystemPermissions.MEMBERS_VIEW;
  readonly module = 'hours';
  readonly effect = 'read' as const;
  readonly input = input;
  readonly reading = 'Reading service hours';

  constructor(
    private readonly service: ServiceEntryService,
    private readonly members: MemberService,
  ) {}

  async run(args: Args, context: AgentToolContext): Promise<AgentToolResult> {
    const { chapterId, timeZone } = context;
    const days = serviceDays(args, context, BACK_DAYS);
    // The queue only for a member who works it: nobody else can read
    // another member's unapproved entry in the app either.
    const approves = holds(context, SystemPermissions.SERVICE_APPROVE);
    const [board, profiles, pending] = await Promise.all([
      this.service.leaderboard(chapterId, {
        startDate: days.from,
        endDate: days.to,
      }),
      this.members.findProfilesByChapter(chapterId),
      approves
        ? this.service.findByChapterFiltered(chapterId, { status: 'PENDING' })
        : Promise.resolve([]),
    ]);
    if (profiles.length === 0) {
      return nothing(context, 'The chapter has no members to count.');
    }
    const people = new People(profiles);
    const logged = board.filter((row) => people.has(row.user_id));
    const withService = new Set(logged.map((row) => row.user_id));
    // An alumni member is not expected to log service, so they are not
    // named as having none.
    const none = profiles
      .filter(
        (profile) => !profile.is_alumni && !withService.has(profile.user_id),
      )
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
    // The queue as Activity shows it (`ActivityService.readHoursApprovals`):
    // oldest sent first, without the approver's own entry, which is not
    // theirs to approve, and with an entry from someone who has since left,
    // which still is.
    const waiting = pending
      .filter((entry) => entry.user_id !== context.userId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    /** Members whose only service in the range is still waiting. */
    const waitingInRange = new Map<string, number>();
    for (const entry of pending) {
      if (entry.date < days.from || entry.date > days.to) continue;
      waitingInRange.set(
        entry.user_id,
        (waitingInRange.get(entry.user_id) ?? 0) + 1,
      );
    }
    const nothingLogged = none.filter(
      (profile) => !waitingInRange.has(profile.user_id),
    );
    const total = logged.reduce((sum, row) => sum + row.total_minutes, 0);
    const active = profiles.filter((profile) => !profile.is_alumni).length;
    const summary = [
      `Approved service from ${longDay(days.from, timeZone)} to ${longDay(days.to, timeZone)}.`,
      `Members with approved service in that range: ${logged.length}.`,
      `Active members with none in that range: ${none.length} of ${active}.`,
      `The chapter's approved service in that range: ${duration(total)}.`,
      ...(approves
        ? [
            `Active members with nothing logged in that range, approved or waiting: ${nothingLogged.length} of ${active}.`,
            `Entries waiting for approval: ${waiting.length}, ${duration(waiting.reduce((sum, entry) => sum + entry.duration_minutes, 0))} in all.`,
          ]
        : []),
    ];
    const waitingRows = waiting
      .slice(0, WAITING_LIMIT)
      .map(
        (entry) =>
          `Waiting for approval: ${people.name(entry.user_id)}, ${duration(entry.duration_minutes)} on ${longDay(entry.date, timeZone)}.`,
      );
    const rows = [
      ...[...logged]
        .sort((a, b) => b.total_minutes - a.total_minutes)
        .map(
          (row) =>
            `${people.name(row.user_id)}: ${duration(row.total_minutes)} across ${count(row.entry_count, 'entry', 'entries')}.`,
        ),
      ...none.map((profile) => {
        const held = waitingInRange.get(profile.user_id);
        return held
          ? `${people.name(profile.user_id)}: no approved service in that range; ${count(held, 'entry', 'entries')} waiting for approval.`
          : `${people.name(profile.user_id)}: no approved service in that range.`;
      }),
    ];
    const shown = fitRows([...summary, ...waitingRows], rows, MEMBERS_LIMIT);
    const cut = rows.length - shown.length;
    const cutLine =
      cut > 0
        ? `${count(cut, 'more member')} not listed here. The counts above include them.`
        : null;
    const notes = [
      approves
        ? 'Totals count only approved service. Entries waiting for approval are listed apart, and a member with one has logged service.'
        : 'Only approved service is counted; an entry still waiting for approval is not.',
      waiting.length > waitingRows.length
        ? `Showing the ${waitingRows.length} oldest of ${waiting.length} waiting entries.`
        : null,
      days.shortened
        ? 'A read covers at most a year, so the range was shortened.'
        : null,
      cutLine ? `Showing ${shown.length} of ${rows.length} members.` : null,
    ].filter(Boolean);
    return found(
      context,
      liveSource({
        id: listSourceId(this.name, args.from, args.to),
        kind: 'points',
        title: 'Service hours',
        page: null,
        lines: [
          ...summary,
          ...waitingRows,
          ...shown,
          ...(cutLine ? [cutLine] : []),
        ],
      }),
      people,
      notes.join(' '),
    );
  }
}
