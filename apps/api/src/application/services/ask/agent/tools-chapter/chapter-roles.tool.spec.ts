import { askerContext, linesOf } from '#test/helpers/agent-tool.fixture';
import type { ActAudienceResolver } from '../../../act/act-audience';
import type { EventService } from '../../../event.service';
import type { EventTypeService } from '../../../event-type.service';
import { ChapterRolesAgentTool } from './chapter-roles.tool';

const role = (id: string, name: string, holders: number, systemKey: string | null = null) => ({
  id,
  name,
  holders,
  systemKey,
});

function build() {
  const options = jest.fn().mockResolvedValue({
    tiers: [
      {
        id: 'tier-cabinet',
        name: 'Cabinet',
        roles: [role('role-president', 'President', 1), role('role-treasurer', 'Treasurer', 0)],
      },
      { id: 'tier-alumni', name: 'Alumni', roles: [role('role-grads', 'Grad Brothers', 4, 'ALUMNI')] },
    ],
    untiered: [role('role-floor', 'Third Floor', 3)],
    groups: [{ id: 'group-1', name: 'Fall 2025', members: 6 }],
  });
  const events = {
    findByChapter: jest.fn().mockResolvedValue([
      {
        name: 'Officer retreat',
        start_time: '2026-09-19T17:00:00.000Z',
        end_time: '2026-09-19T20:00:00.000Z',
        is_mandatory: false,
        required_role_ids: ['role-president', 'role-treasurer'],
        optional_role_ids: null,
        excluded_role_ids: null,
        others_invited: false,
      },
      {
        name: 'Chapter meeting',
        start_time: '2026-11-08T23:00:00.000Z',
        end_time: '2026-11-09T00:00:00.000Z',
        is_mandatory: true,
        required_role_ids: null,
        optional_role_ids: null,
        excluded_role_ids: null,
        others_invited: null,
      },
    ]),
  };
  const types = {
    list: jest.fn().mockResolvedValue([
      { name: 'FSL', point_value: 5, is_mandatory: false },
    ]),
  };
  const tool = new ChapterRolesAgentTool(
    { options } as unknown as ActAudienceResolver,
    types as unknown as EventTypeService,
    events as unknown as EventService,
  );
  return { tool, options, events, types };
}

describe('chapter_roles (#5853)', () => {
  it('lists the tiers with their roles and holders, the untiered roles and the alumni rule', async () => {
    const { tool, events, types } = build();
    const lines = linesOf(
      await tool.run(tool.input.parse({}), askerContext()),
    );
    expect(lines).toEqual(
      expect.arrayContaining([
        '- Tier "Cabinet": President (1 member), Treasurer (0 members)',
        'Roles in no tier: Third Floor (3 members)',
      ]),
    );
    expect(lines.join('\n')).toContain('Alumni ("Grad Brothers") are left out');
    // Nothing about events or groups unless asked.
    expect(lines.join('\n')).not.toContain('Event types');
    expect(lines.join('\n')).not.toContain('Fall 2025');
    expect(events.findByChapter).not.toHaveBeenCalled();
    expect(types.list).not.toHaveBeenCalled();
  });

  it('adds the event types and who recent events invited, for an event card', async () => {
    const { tool, events } = build();
    const context = askerContext();
    const text = linesOf(
      await tool.run(tool.input.parse({ for_card: 'event' }), context),
    ).join('\n');
    expect(text).toContain('Event types: "FSL" (5 points, optional for everyone)');
    expect(text).toContain(
      '- "Officer retreat" on Saturday, September 19, 2026: President and Treasurer required, nobody else invited',
    );
    // An event that invites everyone the same way says nothing new.
    expect(text).not.toContain('"Chapter meeting" on');
    // Read as the asker, so an event they can't see is never listed.
    expect(events.findByChapter).toHaveBeenCalledWith(
      context.chapterId,
      context.userId,
      expect.any(Object),
    );
  });

  it('adds the groups for a task card', async () => {
    const { tool, options } = build();
    const text = linesOf(
      await tool.run(tool.input.parse({ for_card: 'task' }), askerContext()),
    ).join('\n');
    expect(text).toContain('Groups, classes and class years: Fall 2025 (6 members)');
    expect(options).toHaveBeenCalledWith('chapter-a', { groups: true });
  });
});
