import { BadRequestException } from '@nestjs/common';
import { Event } from '#domain/entities/event.entity';
import type { GeofenceCoordinate } from '#domain/entities/study.entity';
import {
  agendaProblem,
  EVENT_ATTACHMENTS_MAX,
  normalizeAgendaText,
  ATTACHMENT_LINK_NOT_PUBLIC_MESSAGE,
  attachmentLinkOpens,
  normalizeAttachmentUrl,
  readAgendaTabledFrom,
  attendanceTierIdOf,
  eventOthersInvited,
  splitAttendancePicks,
  type EventAgendaItem,
  type EventAttendancePicks,
  type EventAgendaTabledFrom,
  type EventAttachment,
} from '@repo/validation';

export interface CreateEventInput {
  chapter_id: string;
  name: string;
  description?: string | null;
  location?: string | null;
  start_time: string;
  end_time: string;
  point_value?: number;
  is_mandatory?: boolean;
  recurrence_rule?: string | null;
  required_role_ids?: string[] | null;
  optional_role_ids?: string[] | null;
  excluded_role_ids?: string[] | null;
  others_invited?: boolean;
  notes?: string | null;
  /** This meeting's agenda, whole (#4934); omitted leaves it. */
  agenda?: EventAgendaItem[];
  /** This meeting's attachments, whole (#4934); omitted leaves it. */
  attachments?: EventAttachmentInput[];
  check_in_zone?: GeofenceCoordinate[] | null;
  check_in_zone_name?: string | null;
  check_in_opens_minutes?: number;
  /** One of the chapter's event types, or omitted for none (#3730). */
  event_type_id?: string | null;
  /** Creator user id — used as the chat card sender when posting via `/event`. */
  created_by?: string;
  /**
   * When set together with `client_message_id`, an interactive event card is
   * posted to this chat channel after the row commits (the `/event` slash
   * command). Omitted for dashboard creates.
   */
  channel_id?: string;
  client_message_id?: string;
  /**
   * Skip the new-event push. Only an internal caller sets it: starting minutes
   * for a meeting that had no event makes one after the fact
   * (`MeetingService.start`), and "New event" for a meeting that already
   * happened would be noise. The DTO has no such field.
   */
  silent?: boolean;
}

/**
 * The created event row, plus whether the chat card that accompanies it was
 * posted.
 *
 * `card_posted` is present ONLY when this request actually attempted a card —
 * chat context supplied (`channel_id` + `client_message_id`) and a creator
 * to post as. A dashboard create's response shape is therefore unchanged. The
 * card stays best-effort — a failed post never rolls the event back — but the
 * caller now learns it failed instead of inferring success from the 2xx and
 * leaving its optimistic placeholder up forever (#1717). Recurring children
 * are side effects of this write and are not in this return value; the parent
 * is what `POST /v1/events` publishes.
 */
export type CreateEventResult = Event & {
  card_posted?: boolean;
};

export interface UpdateEventInput {
  name?: string;
  description?: string | null;
  location?: string | null;
  start_time?: string;
  end_time?: string;
  point_value?: number;
  is_mandatory?: boolean;
  recurrence_rule?: string | null;
  required_role_ids?: string[] | null;
  optional_role_ids?: string[] | null;
  excluded_role_ids?: string[] | null;
  others_invited?: boolean;
  /**
   * Never from a request: {@link attendanceUpdate} derives it from the role
   * lists, so a series edit carries it to every meeting it rewrites.
   */
  attendance_picks?: EventAttendancePicks | null;
  notes?: string | null;
  /** This meeting's agenda, whole (#4934); omitted leaves it. */
  agenda?: EventAgendaItem[];
  /** This meeting's attachments, whole (#4934); omitted leaves it. */
  attachments?: EventAttachmentInput[];
  check_in_zone?: GeofenceCoordinate[] | null;
  check_in_zone_name?: string | null;
  check_in_opens_minutes?: number;
  /** `null` clears the type; omitted leaves it. */
  event_type_id?: string | null;
}

/**
 * What a series edit may write (`EventSeriesService.updateSeries`): an
 * update without a meeting's own `agenda` and `attachments` (#4934), which
 * `EventService.update` writes to the addressed occurrence only. Leaving them
 * out of the type means no series path can copy them across by accident.
 */
export type SeriesUpdateInput = Omit<
  UpdateEventInput,
  'agenda' | 'attachments'
>;

type AttendanceLists = Pick<
  Event,
  'required_role_ids' | 'optional_role_ids' | 'excluded_role_ids'
>;

type AttendanceColumns = Partial<AttendanceLists> & {
  attendance_picks?: EventAttendancePicks | null;
  others_invited?: boolean | null;
};

/**
 * A create's attendance columns (`spec/behavior/events.md` § Attendance by
 * role): a list may name a tier as `tier:<id>` beside role ids. Such an
 * event keeps the lists as sent in `attendance_picks` and its role lists hold
 * only role ids, which the database tops up with every tier's roles
 * (`events_expand_attendance_picks`). An event naming no tier is written
 * exactly as before, with `attendance_picks` null.
 *
 * An event that names a tier always stores `others_invited`: left null, it
 * would read through `required_role_ids` (`eventOthersInvited`), and a tier
 * with no roles expands to none, which would open "Cabinet required, nobody
 * else invited" to the whole chapter.
 */
export function attendanceCreate(
  input: Pick<
    CreateEventInput,
    | 'required_role_ids'
    | 'optional_role_ids'
    | 'excluded_role_ids'
    | 'others_invited'
  >,
): AttendanceLists & {
  attendance_picks: EventAttendancePicks | null;
  others_invited: boolean | null;
} {
  const split = splitAttendancePicks({
    required_role_ids: input.required_role_ids ?? null,
    optional_role_ids: input.optional_role_ids ?? null,
    excluded_role_ids: input.excluded_role_ids ?? null,
  });
  const others_invited =
    input.others_invited ??
    (split.attendance_picks
      ? eventOthersInvited({ required_role_ids: input.required_role_ids })
      : null);
  return { ...split, others_invited };
}

/**
 * An update's attendance columns, or `{}` when it sends no list.
 *
 * - Naming no tier, on an event that names none, it writes just the lists
 *   sent, as before tiers.
 * - Otherwise a list the update leaves out keeps what the event picked (its
 *   picks when it names a tier, else its role list), so a request that sends
 *   one list neither drops a tier nor flattens the others.
 * - Sent by a build that predates tiers (no `tier:` entry anywhere), the
 *   lists are written as role lists and the picks cleared: the event keeps
 *   the roles it was showing that build.
 * - Naming a tier, `others_invited` is written out (as on create) when the
 *   update doesn't send it and the row holds none.
 */
export function attendanceUpdate(
  input: Pick<
    UpdateEventInput,
    | 'required_role_ids'
    | 'optional_role_ids'
    | 'excluded_role_ids'
    | 'others_invited'
  >,
  existing: Pick<
    Event,
    keyof AttendanceLists | 'attendance_picks' | 'others_invited'
  >,
): AttendanceColumns {
  const sent =
    input.required_role_ids !== undefined ||
    input.optional_role_ids !== undefined ||
    input.excluded_role_ids !== undefined;
  if (!sent) return {};
  const picks = existing.attendance_picks;
  const namesTier = [
    ...(input.required_role_ids ?? []),
    ...(input.optional_role_ids ?? []),
    ...(input.excluded_role_ids ?? []),
  ].some((entry) => attendanceTierIdOf(entry) !== null);
  if (!picks && !namesTier) {
    const only: AttendanceColumns = {};
    if (input.required_role_ids !== undefined) {
      only.required_role_ids = input.required_role_ids;
    }
    if (input.optional_role_ids !== undefined) {
      only.optional_role_ids = input.optional_role_ids;
    }
    if (input.excluded_role_ids !== undefined) {
      only.excluded_role_ids = input.excluded_role_ids;
    }
    return only;
  }
  const kept = (
    given: string[] | null | undefined,
    picked: string[] | undefined,
    stored: string[] | null,
  ) => (given !== undefined ? given : (picked ?? stored));
  const lists = {
    required_role_ids: kept(
      input.required_role_ids,
      picks?.required,
      existing.required_role_ids,
    ),
    optional_role_ids: kept(
      input.optional_role_ids,
      picks?.optional,
      existing.optional_role_ids,
    ),
    excluded_role_ids: kept(
      input.excluded_role_ids,
      picks?.not_invited,
      existing.excluded_role_ids,
    ),
  };
  const split: AttendanceColumns = splitAttendancePicks(lists);
  if (
    split.attendance_picks &&
    input.others_invited === undefined &&
    existing.others_invited === null
  ) {
    split.others_invited = eventOthersInvited({
      required_role_ids: lists.required_role_ids,
    });
  }
  return split;
}

/**
 * Which occurrences of a recurring event a write applies to.
 *
 * `spec/behavior/events.md` § Recurring events fixes this at two values, not
 * the usual calendar-app three: *"Each instance can be individually edited or
 * canceled. Recurrence rules can be modified (changes apply to future instances
 * only)."* There is deliberately no "this and past" — see `EventSeriesService.partitionByTime` for
 * why the past boundary is enforced rather than merely documented.
 *
 * `'instance'` is the default on every route so existing callers, which send no
 * scope at all, keep their exact current single-row behavior.
 */
export type EventMutationScope = 'instance' | 'series';

/**
 * An attachment as a request sends it (#4934): one flat shape, whose `kind`
 * says which of `url` and `document_id` it carries. `normalizeAttachments`
 * turns it into the stored `EventAttachment`.
 */
export interface EventAttachmentInput {
  id: string;
  kind: EventAttachment['kind'];
  url?: string;
  document_id?: string;
  title: string;
}

/**
 * Normalize an inbound check-in zone to what the column stores.
 *
 * An empty array **clears** the zone, mirroring the `required_role_ids` wire
 * semantics already documented in `spec/behavior/events.md` — one rule for
 * "unset this optional collection" across the whole event payload rather than
 * two. A 1- or 2-point array is rejected here so the caller gets a 400 naming
 * the problem instead of a 500 surfacing from the table's shape CHECK.
 */
export function normalizeCheckInZone(
  zone: GeofenceCoordinate[] | null | undefined,
): GeofenceCoordinate[] | null | undefined {
  if (zone === undefined) return undefined;
  if (zone === null || zone.length === 0) return null;
  if (zone.length < 3) {
    throw new BadRequestException(
      'check_in_zone must have at least 3 points, or be empty to clear it',
    );
  }
  return zone;
}

/**
 * An agenda as the column stores it (#4934): each item's text trimmed with
 * inner whitespace collapsed. An empty item, a duplicate id, or a list past
 * the limits is a 400 naming it, rather than the table check's 500. The DTO
 * has already checked each field's type and length.
 */
export function normalizeAgenda(
  items: readonly EventAgendaItem[] | undefined,
): EventAgendaItem[] | undefined {
  if (items === undefined) return undefined;
  const cleaned = items.map((item) => ({
    id: item.id,
    text: normalizeAgendaText(item.text),
    done: item.done,
  }));
  const problem = agendaProblem(cleaned);
  if (problem) throw new BadRequestException(problem);
  assertUniqueIds(cleaned, 'agenda');
  return cleaned;
}

/**
 * `next` with each item's `tabled_from` (#5534) taken from the stored item
 * of the same id, and from nowhere else: a client never sets or changes it.
 */
export function keepAgendaTabledFrom(
  next: readonly EventAgendaItem[],
  stored: readonly EventAgendaItem[] | null | undefined,
): EventAgendaItem[] {
  const origins = new Map<string, EventAgendaTabledFrom>();
  for (const item of stored ?? []) {
    const from = readAgendaTabledFrom(item.tabled_from);
    if (from) origins.set(item.id, from);
  }
  return next.map((item) => {
    const base = { id: item.id, text: item.text, done: item.done };
    const from = origins.get(item.id);
    return from ? { ...base, tabled_from: from } : base;
  });
}

/**
 * Attachments as the column stores them (#4934): a link's URL normalized
 * (http or https only), every title trimmed and non-empty, and only the
 * fields its `kind` carries. A link must also name a public site a phone can
 * open (`attachmentLinkOpens`, #5883), except one whose address the meeting
 * already held (`stored`): the list is sent whole, so a link saved before
 * the rule must not block every later save. Whether a document is the
 * chapter's is the caller's check (`EventService`), since it needs a read.
 */
export function normalizeAttachments(
  items: readonly EventAttachmentInput[] | undefined,
  stored: readonly EventAttachment[] = [],
): EventAttachment[] | undefined {
  if (items === undefined) return undefined;
  if (items.length > EVENT_ATTACHMENTS_MAX) {
    throw new BadRequestException(
      `An event holds at most ${EVENT_ATTACHMENTS_MAX} attachments.`,
    );
  }
  const heldLinks = new Set(
    stored.flatMap((a) => (a.kind === 'link' ? [a.url] : [])),
  );
  const cleaned = items.map((item): EventAttachment => {
    const title = item.title.replace(/\s+/g, ' ').trim();
    if (!title) {
      throw new BadRequestException('Every attachment needs a title.');
    }
    if (item.kind === 'link') {
      const url = normalizeAttachmentUrl(item.url ?? '');
      if (!url) {
        throw new BadRequestException(
          'A link attachment needs a web address starting with http:// or https://.',
        );
      }
      if (!attachmentLinkOpens(url) && !heldLinks.has(url)) {
        throw new BadRequestException(ATTACHMENT_LINK_NOT_PUBLIC_MESSAGE);
      }
      return { id: item.id, kind: 'link', url, title };
    }
    if (!item.document_id) {
      throw new BadRequestException(
        'A document attachment needs the document it points at.',
      );
    }
    return {
      id: item.id,
      kind: 'document',
      document_id: item.document_id,
      title,
    };
  });
  assertUniqueIds(cleaned, 'attachments');
  return cleaned;
}

function assertUniqueIds(
  items: readonly { id: string }[],
  field: 'agenda' | 'attachments',
): void {
  const seen = new Set<string>();
  for (const { id } of items) {
    if (!id.trim()) {
      throw new BadRequestException(`Every ${field} entry needs an id.`);
    }
    if (seen.has(id)) {
      throw new BadRequestException(`${field} has two entries with id ${id}.`);
    }
    seen.add(id);
  }
}
