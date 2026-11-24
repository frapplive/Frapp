import { BadRequestException } from '@nestjs/common';
import {
  FRAPP_LINKS_MAX,
  frappLinkKey,
  frappWebLinkOpens,
  frappWebLinkTitle,
  FRAPP_LINK_NOT_PUBLIC_MESSAGE,
  normalizeFrappLinkUrl,
  FRAPP_LINK_COPY,
  type FrappRecordLink,
  type FrappLink,
  type FrappLinkKind,
} from '@repo/validation';

/**
 * A Frapp link as a request sends it (`spec/behavior/frapp-links.md`): one
 * flat shape whose `kind` says which ids it carries. {@link normalizeFrappLinks}
 * turns it into the stored `FrappLink`.
 */
export interface FrappLinkInput {
  id: string;
  kind: FrappLinkKind;
  url?: string;
  document_id?: string;
  meeting_id?: string;
  event_id?: string;
  channel_id?: string;
  message_id?: string;
  title?: string;
}

/**
 * Whose list it is. A task's record links keep no title, so a member who
 * can't open a record never reads its name. An event's entries always carry
 * one, as the event contract has since #4934, but a record's is always its
 * kind's own word ("Document", "Minutes"), never a name: phone builds from
 * before Frapp links draw it to every member who sees the event. A name an
 * older save stored is replaced on the next save.
 */
export type FrappLinkOwner = 'event' | 'task';

const OWNER_WORDS: Record<FrappLinkOwner, string> = {
  event: 'An event',
  task: 'A task',
};

function kindTitled<T extends FrappRecordLink>(
  owner: FrappLinkOwner,
  link: T,
): T {
  return owner === 'event'
    ? { ...link, title: FRAPP_LINK_COPY.kindNames[link.kind] }
    : link;
}

function need(value: string | undefined, what: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new BadRequestException(
      `A ${what} link needs the ${what} it points at.`,
    );
  }
  return trimmed;
}

/**
 * A list as its column stores it: a web link's address normalized (http or
 * https only) and titled, each record kind carrying only its own ids, no two
 * entries with one id, and at most `FRAPP_LINKS_MAX`. Each problem is a 400
 * naming it. A second entry pointing at the same thing is dropped, keeping
 * the first, so a list an older build saved with a repeat still saves. A new
 * web link must also name a public site a phone can open (`frappWebLinkOpens`,
 * #5883), except an address the list already held (`stored`): the list is
 * sent whole, so a link saved before the rule must not block every later
 * save. Whether each record is the chapter's is `FrappLinkChecker`'s, since
 * it needs reads.
 */
export function normalizeFrappLinks(
  items: readonly FrappLinkInput[] | undefined,
  owner: FrappLinkOwner,
  stored: readonly FrappLink[] = [],
): FrappLink[] | undefined {
  if (items === undefined) return undefined;
  if (items.length > FRAPP_LINKS_MAX) {
    throw new BadRequestException(
      `${OWNER_WORDS[owner]} holds at most ${FRAPP_LINKS_MAX} attachments.`,
    );
  }
  const heldUrls = new Set(
    stored.flatMap((link) => (link.kind === 'link' ? [link.url] : [])),
  );
  const cleaned = items.map((item): FrappLink => {
    const id = item.id.trim();
    if (!id) throw new BadRequestException('Every attachment needs an id.');
    switch (item.kind) {
      case 'link': {
        const url = normalizeFrappLinkUrl(item.url ?? '');
        if (!url) {
          throw new BadRequestException(
            'A link attachment needs a web address starting with http:// or https://.',
          );
        }
        if (!frappWebLinkOpens(url) && !heldUrls.has(url)) {
          throw new BadRequestException(FRAPP_LINK_NOT_PUBLIC_MESSAGE);
        }
        return {
          id,
          kind: 'link',
          url,
          title: frappWebLinkTitle(item.title ?? '', url),
        };
      }
      case 'document':
        return kindTitled(owner, {
          id,
          kind: 'document',
          document_id: need(item.document_id, 'document'),
        });
      case 'minutes':
        return kindTitled(owner, {
          id,
          kind: 'minutes',
          meeting_id: need(item.meeting_id, 'minutes'),
        });
      case 'event':
        return kindTitled(owner, {
          id,
          kind: 'event',
          event_id: need(item.event_id, 'event'),
        });
      case 'message':
        return kindTitled(owner, {
          id,
          kind: 'message',
          channel_id: need(item.channel_id, 'message'),
          message_id: need(item.message_id, 'message'),
        });
      default:
        throw new BadRequestException(
          `An attachment can't be a ${String((item as { kind: unknown }).kind)}.`,
        );
    }
  });
  const ids = new Set<string>();
  const keys = new Set<string>();
  return cleaned.filter((link) => {
    if (ids.has(link.id)) {
      throw new BadRequestException(
        `attachments has two entries with id ${link.id}.`,
      );
    }
    ids.add(link.id);
    const key = frappLinkKey(link);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

/** The kinds phone builds from before Frapp links could read (#4934). */
const FIRST_KINDS: ReadonlySet<FrappLinkKind> = new Set(['link', 'document']);

/**
 * An event's list as a phone build from before Frapp links saved it, with
 * what that build couldn't see put back: it reads only web links and
 * documents and sends the list whole, so a minutes, event or message link it
 * skipped would otherwise vanish on its next save. Those are kept in their
 * stored order after the sent list, as far as `FRAPP_LINKS_MAX` allows.
 */
export function keepUnseenLinks(
  sent: readonly FrappLink[],
  stored: readonly FrappLink[],
): FrappLink[] {
  const ids = new Set(sent.map((link) => link.id));
  const keys = new Set(sent.map((link) => frappLinkKey(link)));
  const unseen = stored.filter(
    (link) =>
      !FIRST_KINDS.has(link.kind) &&
      !ids.has(link.id) &&
      !keys.has(frappLinkKey(link)),
  );
  return [...sent, ...unseen].slice(0, FRAPP_LINKS_MAX);
}
