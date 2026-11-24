import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RushSettingsService } from './rush-settings.service';
import type { IRushPipelineRepository } from '#domain/repositories/rush-pipeline.repository.interface';
import type { IRoleRepository } from '#domain/repositories/role.repository.interface';
import type { IRoleTierRepository } from '#domain/repositories/role-tier.repository.interface';
import type { IChapterGroupRepository } from '#domain/repositories/chapter-group.repository.interface';
import type { IChatChannelRepository } from '#domain/repositories/chat.repository.interface';
import type { IUserRepository } from '#domain/repositories/user.repository.interface';
import type { RushSettingsRow } from '#domain/entities/rush-pipeline.entity';
import type { ChannelAccessService } from './channel-access.service';
import type { RbacService } from './rbac.service';

const CHAPTER = 'ch-1';

const role = (
  id: string,
  tier_id: string | null,
  display_order: number,
  permissions: string[] = ['members:view'],
) => ({
  id,
  chapter_id: CHAPTER,
  name: id,
  tier_id,
  display_order,
  permissions,
});

/**
 * The Recruitment settings page's own settings (#5934, #5973): the stale
 * days, the new-member role and its default, the contacts Group and who in it
 * is skipped, and the card channel's privacy check.
 */
describe('RushSettingsService', () => {
  let row: RushSettingsRow | null;
  let pipelineRepo: { findSettings: jest.Mock; saveSettings: jest.Mock };
  let roleRepo: { findByChapter: jest.Mock; findByIds: jest.Mock };
  let tierRepo: { findByChapter: jest.Mock };
  let groupRepo: { findById: jest.Mock; findMemberIds: jest.Mock };
  let channelRepo: { findById: jest.Mock };
  let userRepo: { findByIds: jest.Mock };
  let channelAccess: { channelReaders: jest.Mock };
  let rbac: { getChapterMemberAccess: jest.Mock };
  let service: RushSettingsService;

  const roles = [
    role('president', 'tier-exec', 0, ['*']),
    role('pledge-b', 'tier-new', 2),
    role('pledge-a', 'tier-new', 1),
    role('brother', 'tier-members', 0),
  ];

  beforeEach(() => {
    row = null;
    pipelineRepo = {
      findSettings: jest.fn(() => Promise.resolve(row)),
      saveSettings: jest.fn((chapter_id: string, patch: object) => {
        row = {
          chapter_id,
          stale_days: 7,
          new_member_role_id: null,
          contacts_group_id: null,
          card_channel_id: null,
          ...row,
          ...patch,
          updated_at: 'now',
        };
        return Promise.resolve(row);
      }),
    };
    roleRepo = {
      findByChapter: jest.fn().mockResolvedValue(roles),
      findByIds: jest.fn((ids: string[]) =>
        Promise.resolve(roles.filter((r) => ids.includes(r.id))),
      ),
    };
    tierRepo = {
      findByChapter: jest.fn().mockResolvedValue([
        { id: 'tier-exec', name: 'Exec board', position: 1 },
        { id: 'tier-new', name: '  new   MEMBERS ', position: 4 },
      ]),
    };
    groupRepo = {
      findById: jest.fn((id: string) =>
        Promise.resolve(id === 'group-1' ? ({ id } as never) : null),
      ),
      findMemberIds: jest.fn().mockResolvedValue(['u-view', 'u-none']),
    };
    channelRepo = {
      findById: jest.fn((id: string) =>
        Promise.resolve(
          id === 'missing'
            ? null
            : ({
                id,
                name: id,
                type: id === 'dm' ? 'DM' : 'PUBLIC',
                archived_at: null,
              } as never),
        ),
      ),
    };
    userRepo = {
      findByIds: jest.fn((ids: string[]) =>
        Promise.resolve(
          ids.map((id) => ({ id, display_name: `Name ${id}` }) as never),
        ),
      ),
    };
    channelAccess = {
      channelReaders: jest.fn((channel: { id: string }) =>
        Promise.resolve(
          channel.id === 'open'
            ? [
                { user_id: 'a', permissions: new Set(['rush:view']) },
                { user_id: 'b', permissions: new Set(['members:view']) },
              ]
            : [
                { user_id: 'a', permissions: new Set(['rush:view']) },
                { user_id: 'p', permissions: new Set(['*']) },
              ],
        ),
      ),
    };
    rbac = {
      getChapterMemberAccess: jest.fn().mockResolvedValue([
        { user_id: 'u-view', permissions: new Set(['rush:view']) },
        { user_id: 'u-none', permissions: new Set(['members:view']) },
      ]),
    };
    service = new RushSettingsService(
      pipelineRepo as unknown as IRushPipelineRepository,
      roleRepo as unknown as IRoleRepository,
      tierRepo as unknown as IRoleTierRepository,
      groupRepo as unknown as IChapterGroupRepository,
      channelRepo as unknown as IChatChannelRepository,
      userRepo as unknown as IUserRepository,
      channelAccess as unknown as ChannelAccessService,
      rbac as unknown as RbacService,
    );
  });

  it('reads the defaults with no row: 7 days, the first New members role', async () => {
    await expect(service.get(CHAPTER)).resolves.toEqual({
      stale_days: 7,
      new_member_role_id: null,
      default_new_member_role_id: 'pledge-a',
      contacts_group_id: null,
      contacts_group_skipped: [],
      card_channel_id: null,
    });
    await expect(service.newMemberRoleId(CHAPTER)).resolves.toBe('pledge-a');
  });

  it('has no default role when the New members tier was renamed away', async () => {
    tierRepo.findByChapter.mockResolvedValue([
      { id: 'tier-new', name: 'Pledges', position: 4 } as never,
    ]);
    await expect(service.newMemberRoleId(CHAPTER)).resolves.toBeNull();
  });

  it('saves only the fields it is sent and keeps the rest', async () => {
    await service.save(CHAPTER, { stale_days: 10 });
    const saved = await service.save(CHAPTER, {
      new_member_role_id: 'brother',
    });
    expect(saved).toMatchObject({
      stale_days: 10,
      new_member_role_id: 'brother',
    });
    expect(pipelineRepo.saveSettings).toHaveBeenLastCalledWith(CHAPTER, {
      new_member_role_id: 'brother',
    });
    await expect(service.newMemberRoleId(CHAPTER)).resolves.toBe('brother');
  });

  it('refuses stale days out of range', async () => {
    await expect(service.save(CHAPTER, { stale_days: 0 })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.save(CHAPTER, { stale_days: 61 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it("refuses another chapter's role and a role that can do everything", async () => {
    await expect(
      service.save(CHAPTER, { new_member_role_id: 'elsewhere' }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.save(CHAPTER, { new_member_role_id: 'president' }),
    ).rejects.toThrow(BadRequestException);
    expect(pipelineRepo.saveSettings).not.toHaveBeenCalled();
  });

  it('names the contacts Group members who are skipped for lacking rush:view', async () => {
    const saved = await service.save(CHAPTER, { contacts_group_id: 'group-1' });
    expect(saved.contacts_group_skipped).toEqual([
      { user_id: 'u-none', display_name: 'Name u-none' },
    ]);
    await expect(
      service.save(CHAPTER, { contacts_group_id: 'group-x' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('takes a card channel only when everyone who can read it holds rush:view', async () => {
    await expect(
      service.save(CHAPTER, { card_channel_id: 'recruitment' }),
    ).resolves.toMatchObject({ card_channel_id: 'recruitment' });
    await expect(
      service.save(CHAPTER, { card_channel_id: 'open' }),
    ).rejects.toThrow("1 person who can read #open can't open recruitment");
    await expect(
      service.save(CHAPTER, { card_channel_id: 'dm' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.save(CHAPTER, { card_channel_id: 'missing' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('clears a pick with null', async () => {
    await service.save(CHAPTER, { card_channel_id: 'recruitment' });
    await expect(
      service.save(CHAPTER, { card_channel_id: null }),
    ).resolves.toMatchObject({ card_channel_id: null });
  });
});
