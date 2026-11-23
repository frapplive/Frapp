import { Injectable } from '@nestjs/common';
import type { Role, RoleTier } from '#domain/entities/role.entity';
import {
  ChapterGroupService,
  type ChapterGroupView,
} from '../chapter-group.service';
import { MemberService } from '../member.service';
import { RbacService } from '../rbac.service';
import { RoleTierService } from '../role-tier.service';
import { askableGroups } from '../ask/agent/tools-chapter/people';
import type { ActNote } from './act-tool';

/**
 * Who a card is for, by the chapter's own names (#5853): the roles, the
 * tiers of roles and the groups an officer already invites and assigns by.
 * Used by the event card ("Cabinet required, nobody else invited"), and
 * built to serve the task card too ("for the Recruitment Committee").
 *
 * A model writes names, never ids (`act-tool.ts`): each is looked up here,
 * in this chapter and nowhere else, and one that is not a role, tier or
 * group of this chapter, or could be two of them, comes back as a note
 * instead of a guess.
 */

export type AudienceKind = 'role' | 'tier' | 'group';

export interface AudienceEntry {
  kind: AudienceKind;
  id: string;
  /** As the chapter wrote it. */
  name: string;
}

/** A role with how many members hold it now. */
export interface AudienceRole {
  id: string;
  name: string;
  holders: number;
  /** A seeded role's key (`MEMBER`, `ALUMNI`), or null. */
  systemKey: string | null;
}

/** What the chapter can invite or assign by, as a model is shown it. */
export interface AudienceOptions {
  /** Highest first, each with its roles. */
  tiers: { id: string; name: string; roles: AudienceRole[] }[];
  /** Roles in no tier. */
  untiered: AudienceRole[];
  /** Groups, classes and class years. Never a major's (`askableGroups`). */
  groups: { id: string; name: string; members: number }[];
}

export interface AudienceResolution {
  entries: AudienceEntry[];
  /** A name that is no role, tier or group, or could be two: the card asks. */
  notes: ActNote[];
}

/** The hidden role every member holds (`@everyone`): never named on a card. */
const EVERYONE_KEY = 'EVERYONE';
/** Names one card's audience may carry; the rest are dropped. */
const AUDIENCE_NAMES_MAX = 40;
const NAME_MAX_LENGTH = 120;

/** Words in front of a name that are not part of it ("all the officers"). */
const LEAD = new Set(['all', 'the', 'every', 'our', 'any']);

function plain(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+]+/gu, ' ')
    .split(' ')
    .filter(Boolean);
}

/** "Brothers" and "brother", "New members" and "New Member". */
function singular(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) {
    return word.slice(0, -1);
  }
  return word;
}

function key(text: string): string {
  const words = plain(text);
  while (words.length > 1 && LEAD.has(words[0])) words.shift();
  return words.map(singular).join(' ');
}

/**
 * The entries a typed name could be, strongest reading first: the same name
 * as written; then the same words, one or many ("Brothers" for the tier
 * "Brother"); then a name every typed word starts a word of, and that has
 * no word the typed name lacks beyond one ("exec" for "Exec board"). The
 * first reading that finds anything decides. At the same strength a role
 * beats a tier, and a tier a group, so "New Member" stays the role when a
 * tier shares its name.
 */
export function entriesNamed(
  typed: string,
  candidates: readonly AudienceEntry[],
): AudienceEntry[] {
  const want = typed.trim().toLowerCase();
  const wantKey = key(typed);
  if (!wantKey) return [];
  const byKind = (found: AudienceEntry[]): AudienceEntry[] => {
    for (const kind of ['role', 'tier', 'group'] as const) {
      const of = found.filter((entry) => entry.kind === kind);
      if (of.length > 0) return of;
    }
    return [];
  };
  const exact = byKind(
    candidates.filter((entry) => entry.name.trim().toLowerCase() === want),
  );
  if (exact.length > 0) return exact;
  const same = byKind(
    candidates.filter((entry) => key(entry.name) === wantKey),
  );
  if (same.length > 0) return same;
  const typedWords = wantKey.split(' ');
  return byKind(
    candidates.filter((entry) => {
      const have = key(entry.name).split(' ');
      return (
        typedWords.every((word) =>
          have.some((other) => other.startsWith(word)),
        ) && have.length <= typedWords.length + 1
      );
    }),
  );
}

@Injectable()
export class ActAudienceResolver {
  constructor(
    private readonly rbac: RbacService,
    private readonly tiers: RoleTierService,
    private readonly groups: ChapterGroupService,
    private readonly members: MemberService,
  ) {}

  /**
   * The chapter's tiers, roles and groups; with `holders`, how many members
   * hold each role (0 otherwise).
   */
  async options(
    chapterId: string,
    include: { groups: boolean; holders?: boolean } = { groups: true },
  ): Promise<AudienceOptions> {
    const [roles, tiers, groups, profiles] = await Promise.all([
      this.rbac.findByChapter(chapterId),
      this.tiers.list(chapterId),
      include.groups
        ? this.groups.list(chapterId).then(askableGroups)
        : Promise.resolve([] as ChapterGroupView[]),
      // The whole roster, read only when the counts are shown.
      include.holders
        ? this.members.findProfilesByChapter(chapterId)
        : Promise.resolve([]),
    ]);
    const holders = new Map<string, number>();
    for (const profile of profiles) {
      for (const id of new Set([
        ...profile.role_ids,
        ...(profile.custom_role_ids ?? []),
      ])) {
        holders.set(id, (holders.get(id) ?? 0) + 1);
      }
    }
    const shown = roles.filter((role) => role.system_key !== EVERYONE_KEY);
    const asRole = (role: Role): AudienceRole => ({
      id: role.id,
      name: role.name,
      holders: holders.get(role.id) ?? 0,
      systemKey: role.system_key ?? null,
    });
    const byOrder = (a: Role, b: Role) =>
      (a.display_order ?? 0) - (b.display_order ?? 0) ||
      a.name.localeCompare(b.name);
    const tierIds = new Set(tiers.map((tier) => tier.id));
    return {
      tiers: [...tiers]
        .sort((a: RoleTier, b: RoleTier) => a.position - b.position)
        .map((tier) => ({
          id: tier.id,
          name: tier.name,
          roles: shown
            .filter((role) => role.tier_id === tier.id)
            .sort(byOrder)
            .map(asRole),
        })),
      untiered: shown
        .filter((role) => !role.tier_id || !tierIds.has(role.tier_id))
        .sort(byOrder)
        .map(asRole),
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        members: group.member_ids.length,
      })),
    };
  }

  /**
   * The names as this chapter's roles, tiers and (when `kinds` allows)
   * groups. A name found nowhere, or found twice at the same strength, is
   * left off and noted.
   */
  async resolve(
    names: readonly string[],
    chapterId: string,
    kinds: readonly AudienceKind[],
  ): Promise<AudienceResolution> {
    const typed = [
      ...new Set(
        names
          .map((name) => name.replace(/\s+/g, ' ').trim())
          .filter((name) => name && name.length <= NAME_MAX_LENGTH),
      ),
    ].slice(0, AUDIENCE_NAMES_MAX);
    if (typed.length === 0) return { entries: [], notes: [] };
    const options = await this.options(chapterId, {
      groups: kinds.includes('group'),
    });
    return resolveAudience(typed, options, kinds);
  }
}

/** The lookup itself, apart from the reads, for the card and its tests. */
export function resolveAudience(
  names: readonly string[],
  options: AudienceOptions,
  kinds: readonly AudienceKind[],
): AudienceResolution {
  const candidates: AudienceEntry[] = [
    ...(kinds.includes('role')
      ? [
          ...options.tiers.flatMap((tier) => tier.roles),
          ...options.untiered,
        ].map((role) => ({
          kind: 'role' as const,
          id: role.id,
          name: role.name,
        }))
      : []),
    ...(kinds.includes('tier')
      ? options.tiers.map((tier) => ({
          kind: 'tier' as const,
          id: tier.id,
          name: tier.name,
        }))
      : []),
    ...(kinds.includes('group')
      ? options.groups.map((group) => ({
          kind: 'group' as const,
          id: group.id,
          name: group.name,
        }))
      : []),
  ];
  const entries: AudienceEntry[] = [];
  const notes: ActNote[] = [];
  for (const name of names) {
    const found = entriesNamed(name, candidates);
    if (found.length === 1) {
      if (!entries.some((entry) => entry.id === found[0].id)) {
        entries.push(found[0]);
      }
    } else {
      notes.push({
        type: found.length === 0 ? 'unmatched_name' : 'ambiguous_name',
        name,
      });
    }
  }
  return { entries, notes };
}

/**
 * An entry as a card's attendance key: a role by its id, a tier as
 * `tier:<id>`, the form the event's Who's coming picker gives a tier. The
 * card names the tier by it; `attendanceByRole` (act-tools.ts) spells it out
 * as the tier's roles before the draft is stored, since events take role
 * ids only.
 */
export function attendanceKeyOf(entry: AudienceEntry): string | null {
  if (entry.kind === 'role') return entry.id;
  if (entry.kind === 'tier') return `tier:${entry.id}`;
  return null;
}
