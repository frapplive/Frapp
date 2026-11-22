import { attendanceCreate, attendanceUpdate } from './event-input';

/**
 * Who's coming by tier (Paul, 2026-11-22; `spec/behavior/events.md`
 * § Attendance by role, Tiers): what the API writes for a list that names a
 * tier, which the database then expands.
 */
const TIER = '11111111-2222-3333-4444-555555555555';
const CABINET = `tier:${TIER}`;

describe('attendanceCreate', () => {
  it('writes a role-only event as before', () => {
    expect(
      attendanceCreate({ required_role_ids: ['r1'], optional_role_ids: [] }),
    ).toEqual({
      attendance_picks: null,
      required_role_ids: ['r1'],
      optional_role_ids: [],
      excluded_role_ids: null,
      others_invited: null,
    });
  });

  it('keeps a tier in the picks, lowercased, and writes others_invited out', () => {
    expect(
      attendanceCreate({ required_role_ids: [`tier:${TIER.toUpperCase()}`] }),
    ).toEqual({
      attendance_picks: { required: [CABINET], optional: [], not_invited: [] },
      required_role_ids: null,
      optional_role_ids: null,
      excluded_role_ids: null,
      // Left null, a tier with no roles would read as "everyone invited".
      others_invited: false,
    });
  });

  it('keeps an explicit others_invited', () => {
    expect(
      attendanceCreate({ optional_role_ids: [CABINET], others_invited: true })
        .others_invited,
    ).toBe(true);
  });
});

describe('attendanceUpdate', () => {
  const plain = {
    required_role_ids: ['r1'],
    optional_role_ids: ['r2'],
    excluded_role_ids: null,
    attendance_picks: null,
    others_invited: false,
  };
  const tiered = {
    required_role_ids: ['r-pres', 'r-vp', 'r1'],
    optional_role_ids: null,
    excluded_role_ids: null,
    attendance_picks: {
      required: [CABINET, 'r1'],
      optional: [],
      not_invited: [],
    },
    others_invited: false,
  };

  it('changes nothing when no list is sent', () => {
    expect(attendanceUpdate({ others_invited: true }, tiered)).toEqual({});
  });

  it('writes only the lists sent on an event naming no tier', () => {
    expect(attendanceUpdate({ excluded_role_ids: ['r3'] }, plain)).toEqual({
      excluded_role_ids: ['r3'],
    });
  });

  it('keeps the tier picks for a list the update leaves out', () => {
    expect(attendanceUpdate({ optional_role_ids: ['r2'] }, tiered)).toEqual({
      attendance_picks: {
        required: [CABINET, 'r1'],
        optional: ['r2'],
        not_invited: [],
      },
      required_role_ids: ['r1'],
      optional_role_ids: ['r2'],
      excluded_role_ids: null,
    });
  });

  it('clears the picks when a pre-tier build sends every list as roles', () => {
    expect(
      attendanceUpdate(
        {
          required_role_ids: ['r-pres', 'r-vp', 'r1'],
          optional_role_ids: [],
          excluded_role_ids: [],
        },
        tiered,
      ),
    ).toEqual({
      attendance_picks: null,
      required_role_ids: ['r-pres', 'r-vp', 'r1'],
      optional_role_ids: [],
      excluded_role_ids: [],
    });
  });

  it('writes others_invited out when a tier lands on a row holding none', () => {
    expect(
      attendanceUpdate(
        { required_role_ids: [CABINET] },
        { ...plain, others_invited: null },
      ).others_invited,
    ).toBe(false);
  });
});
