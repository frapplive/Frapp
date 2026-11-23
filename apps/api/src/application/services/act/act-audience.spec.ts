import {
  resolveAudience,
  type AudienceKind,
  type AudienceOptions,
} from './act-audience';

const role = (id: string, name: string) => ({
  id,
  name,
  holders: 1,
  systemKey: null,
});

/** The tiers, roles and groups of a chapter like Paul's (#5853). */
const OPTIONS: AudienceOptions = {
  tiers: [
    {
      id: 'tier-cabinet',
      name: 'Cabinet',
      roles: [
        role('role-president', 'President'),
        role('role-historian', 'Historian'),
      ],
    },
    {
      id: 'tier-chairs',
      name: 'Committee Chairs',
      roles: [
        role('role-social', 'Social Chair'),
        role('role-risk', 'Risk Chair'),
      ],
    },
    {
      id: 'tier-brothers',
      name: 'Brothers',
      roles: [role('role-actives', 'Actives')],
    },
    {
      id: 'tier-new',
      name: 'New members',
      roles: [role('role-new', 'New Member')],
    },
  ],
  untiered: [role('role-floor', 'Third Floor')],
  groups: [{ id: 'group-recruit', name: 'Recruitment Committee', members: 3 }],
};

const ids = (
  names: string[],
  kinds: readonly AudienceKind[] = ['role', 'tier', 'group'],
) => resolveAudience(names, OPTIONS, kinds);

describe('resolveAudience', () => {
  it('reads a tier, a role and a group by the names the chapter uses', () => {
    expect(
      ids(['cabinet', 'the Social Chair', 'Recruitment Committee']).entries,
    ).toEqual([
      { kind: 'tier', id: 'tier-cabinet', name: 'Cabinet' },
      { kind: 'role', id: 'role-social', name: 'Social Chair' },
      { kind: 'group', id: 'group-recruit', name: 'Recruitment Committee' },
    ]);
  });

  it('reads a plural or a leading word as the same name', () => {
    expect(
      ids(['all brothers', 'Historians']).entries.map((e) => e.id),
    ).toEqual(['tier-brothers', 'role-historian']);
  });

  it('takes the name as written first, then the role over a tier of the same name', () => {
    expect(ids(['New members']).entries.map((e) => e.id)).toEqual(['tier-new']);
    expect(ids(['all new member']).entries.map((e) => e.id)).toEqual([
      'role-new',
    ]);
  });

  it('notes a name it cannot place, or could place twice, and never guesses', () => {
    const read = ids(['Officers', 'Chair']);
    expect(read.entries).toEqual([]);
    expect(read.notes).toEqual([
      { type: 'unmatched_name', name: 'Officers' },
      { type: 'ambiguous_name', name: 'Chair' },
    ]);
  });

  it('looks only at the kinds asked for', () => {
    expect(ids(['Recruitment Committee'], ['role', 'tier']).notes).toEqual([
      { type: 'unmatched_name', name: 'Recruitment Committee' },
    ]);
  });
});
