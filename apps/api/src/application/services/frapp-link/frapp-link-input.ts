import { BadRequestException } from '@nestjs/common';
import {
  FRAPP_LINKS_MAX,
  frappLinkKey,
  frappLinkTitle,
  frappWebLinkTitle,
  normalizeFrappLinkUrl,
  FRAPP_LINK_COPY,
  type FrappEventLink,
  type FrappMessageLink,
  type FrappMinutesLink,
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
 * one, as the event contract has since #4934: a document keeps the name it
 * had when attached (phone builds from before Frapp links draw it), and the
 * other record kinds take the kind's own word ("Minutes"), never a name.
 */
export type FrappLinkOwner = 'event' | 'task';

const OWNER_WORDS: Record<FrappLinkOwner, string> = {
  event: 'An event',
  task: 'A task',
};

function kindTitled<
  T extends FrappMinutesLink | FrappEventLink | FrappMessageLink,
>(owner: FrappLinkOwner, link: T): T {
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
 * entries with one id or pointing at the same thing, and at most
 * `FRAPP_LINKS_MAX`. Each problem is a 400 naming it. Whether each record is
 * the chapter's is `FrappLinkChecker`'s, since it needs reads.
 */
export function normalizeFrappLinks(
  items: readonly FrappLinkInput[] | undefined,
  owner: FrappLinkOwner,
): FrappLink[] | undefined {
  if (items === undefined) return undefined;
  if (items.length > FRAPP_LINKS_MAX) {
    throw new BadRequestException(
      `${OWNER_WORDS[owner]} holds at most ${FRAPP_LINKS_MAX} attachments.`,
    );
  }
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
        return {
          id,
          kind: 'link',
          url,
          title: frappWebLinkTitle(item.title ?? '', url),
        };
      }
      case 'document': {
        const documentId = need(item.document_id, 'document');
        const title = owner === 'event' ? frappLinkTitle(item.title ?? '') : '';
        if (owner === 'event' && !title) {
          throw new BadRequestException('Every attachment needs a title.');
        }
        return title
          ? { id, kind: 'document', document_id: documentId, title }
          : { id, kind: 'document', document_id: documentId };
      }
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
  for (const link of cleaned) {
    if (ids.has(link.id)) {
      throw new BadRequestException(
        `attachments has two entries with id ${link.id}.`,
      );
    }
    ids.add(link.id);
    const key = frappLinkKey(link);
    if (keys.has(key)) {
      throw new BadRequestException('That is attached already.');
    }
    keys.add(key);
  }
  return cleaned;
}
