import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  RUSH_STALE_DAYS_DEFAULT,
  RUSH_STALE_DAYS_MAX,
  RUSH_STALE_DAYS_MIN,
  rushNewMembersTier,
} from '@repo/validation';
import { RUSH_PIPELINE_REPOSITORY } from '#domain/repositories/rush-pipeline.repository.interface';
import type { IRushPipelineRepository } from '#domain/repositories/rush-pipeline.repository.interface';
import { ROLE_REPOSITORY } from '#domain/repositories/role.repository.interface';
import type { IRoleRepository } from '#domain/repositories/role.repository.interface';
import { ROLE_TIER_REPOSITORY } from '#domain/repositories/role-tier.repository.interface';
import type { IRoleTierRepository } from '#domain/repositories/role-tier.repository.interface';
import { CHAPTER_GROUP_REPOSITORY } from '#domain/repositories/chapter-group.repository.interface';
import type { IChapterGroupRepository } from '#domain/repositories/chapter-group.repository.interface';
import { CHAT_CHANNEL_REPOSITORY } from '#domain/repositories/chat.repository.interface';
import type { IChatChannelRepository } from '#domain/repositories/chat.repository.interface';
import { USER_REPOSITORY } from '#domain/repositories/user.repository.interface';
import type { IUserRepository } from '#domain/repositories/user.repository.interface';
import { SystemPermissions } from '#domain/constants/permissions';
import type {
  RushSettings,
  RushSettingsPatch,
  RushSettingsRow,
  RushSettingsSkippedMember,
} from '#domain/entities/rush-pipeline.entity';
import type { Role } from '#domain/entities/role.entity';
import { ChannelAccessService } from './channel-access.service';
import { RbacService } from './rbac.service';

/** Whether a member's resolved permissions reach `rush:view`. */
function canViewRush(permissions: ReadonlySet<string>): boolean {
  return permissions.has('*') || permissions.has(SystemPermissions.RUSH_VIEW);
}

/**
 * The Recruitment settings page's own settings (#5934, #5973,
 * `spec/behavior/ifc-recruitment.md` § Where the chapter's settings live):
 * the stale days, the role an accepted PNM's invite carries, the recruitment
 * contacts Group and the card channel. Stages and tags are
 * `RushPipelineService`'s. Reading needs `rush:view`; saving `rush:manage`.
 */
@Injectable()
export class RushSettingsService {
  constructor(
    @Inject(RUSH_PIPELINE_REPOSITORY)
    private readonly pipelineRepo: IRushPipelineRepository,
    @Inject(ROLE_REPOSITORY) private readonly roleRepo: IRoleRepository,
    @Inject(ROLE_TIER_REPOSITORY)
    private readonly tierRepo: IRoleTierRepository,
    @Inject(CHAPTER_GROUP_REPOSITORY)
    private readonly groupRepo: IChapterGroupRepository,
    @Inject(CHAT_CHANNEL_REPOSITORY)
    private readonly channelRepo: IChatChannelRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    private readonly channelAccess: ChannelAccessService,
    private readonly rbac: RbacService,
  ) {}

  /** The settings, defaults filled in; no row reads as the defaults. */
  async get(chapterId: string): Promise<RushSettings> {
    const row = await this.pipelineRepo.findSettings(chapterId);
    return this.view(chapterId, row);
  }

  /**
   * Saves the fields `patch` names. Each pick must be this chapter's: a role
   * that doesn't hold everything (`*`), a group, and a channel everyone who
   * can read holds `rush:view`, because the card shows a prospect's name and
   * stage to the whole channel (`ifc-recruitment.md` § What a submission
   * does).
   */
  async save(
    chapterId: string,
    patch: RushSettingsPatch,
  ): Promise<RushSettings> {
    const write: RushSettingsPatch = {};
    if (patch.stale_days !== undefined) {
      const days = patch.stale_days;
      if (
        !Number.isInteger(days) ||
        days < RUSH_STALE_DAYS_MIN ||
        days > RUSH_STALE_DAYS_MAX
      ) {
        throw new BadRequestException(
          `Pick from ${RUSH_STALE_DAYS_MIN} to ${RUSH_STALE_DAYS_MAX} days`,
        );
      }
      write.stale_days = days;
    }
    if (patch.new_member_role_id !== undefined) {
      if (patch.new_member_role_id !== null) {
        await this.requireNewMemberRole(chapterId, patch.new_member_role_id);
      }
      write.new_member_role_id = patch.new_member_role_id;
    }
    if (patch.contacts_group_id !== undefined) {
      if (
        patch.contacts_group_id !== null &&
        !(await this.groupRepo.findById(patch.contacts_group_id, chapterId))
      ) {
        throw new NotFoundException('Group not found');
      }
      write.contacts_group_id = patch.contacts_group_id;
    }
    if (patch.card_channel_id !== undefined) {
      if (patch.card_channel_id !== null) {
        await this.requirePrivateEnoughChannel(
          chapterId,
          patch.card_channel_id,
        );
      }
      write.card_channel_id = patch.card_channel_id;
    }
    if (Object.keys(write).length === 0) return this.get(chapterId);
    const row = await this.pipelineRepo.saveSettings(chapterId, write);
    return this.view(chapterId, row);
  }

  /**
   * The role an accepted PNM's invite carries: the one picked, while it is
   * still the chapter's, else the default. Null when there is neither, and
   * the settings page then asks the chapter to pick one.
   */
  async newMemberRoleId(chapterId: string): Promise<string | null> {
    const settings = await this.get(chapterId);
    return settings.new_member_role_id ?? settings.default_new_member_role_id;
  }

  private async view(
    chapterId: string,
    row: RushSettingsRow | null,
  ): Promise<RushSettings> {
    const groupId = row?.contacts_group_id ?? null;
    const [defaultRoleId, skipped] = await Promise.all([
      this.defaultNewMemberRoleId(chapterId),
      groupId === null
        ? Promise.resolve([])
        : this.groupMembersWithoutView(chapterId, groupId),
    ]);
    return {
      stale_days: row?.stale_days ?? RUSH_STALE_DAYS_DEFAULT,
      new_member_role_id: row?.new_member_role_id ?? null,
      default_new_member_role_id: defaultRoleId,
      contacts_group_id: groupId,
      contacts_group_skipped: skipped,
      card_channel_id: row?.card_channel_id ?? null,
    };
  }

  /**
   * The first role in the chapter's New members tier (`rushNewMembersTier`
   * finds the tier by name), by the roles' order in it. Null when the tier
   * was renamed away or holds no role.
   */
  private async defaultNewMemberRoleId(
    chapterId: string,
  ): Promise<string | null> {
    const [tiers, roles] = await Promise.all([
      this.tierRepo.findByChapter(chapterId),
      this.roleRepo.findByChapter(chapterId),
    ]);
    const tier = rushNewMembersTier(tiers);
    if (!tier) return null;
    const first = roles
      .filter((role) => role.tier_id === tier.id && !holdsEverything(role))
      .sort(
        (a, b) =>
          a.display_order - b.display_order || a.name.localeCompare(b.name),
      )[0];
    return first?.id ?? null;
  }

  private async requireNewMemberRole(
    chapterId: string,
    roleId: string,
  ): Promise<void> {
    const [role] = await this.roleRepo.findByIds([roleId], chapterId);
    if (!role) throw new NotFoundException('Role not found');
    if (holdsEverything(role)) {
      throw new BadRequestException(
        "A new member can't join with a role that can do everything",
      );
    }
  }

  /**
   * The card shows to everyone who can read the channel, so each of them
   * must hold `rush:view`. Checked when the channel is picked; the
   * interest-form slice checks again at every post.
   */
  private async requirePrivateEnoughChannel(
    chapterId: string,
    channelId: string,
  ): Promise<void> {
    const channel = await this.channelRepo.findById(channelId, chapterId);
    if (!channel || channel.archived_at !== null) {
      throw new NotFoundException('Channel not found');
    }
    if (channel.type === 'DM' || channel.type === 'GROUP_DM') {
      throw new BadRequestException('Pick a channel, not a direct message');
    }
    const readers = await this.channelAccess.channelReaders(channel, chapterId);
    const outside = readers.filter(
      (reader) => !canViewRush(reader.permissions),
    ).length;
    if (outside > 0) {
      throw new BadRequestException(
        `${outside} ${outside === 1 ? 'person' : 'people'} who can read #${channel.name} can't open recruitment. Pick a channel only recruitment can see.`,
      );
    }
  }

  /** Members of the Group who lack `rush:view`, by name, so the page can say. */
  private async groupMembersWithoutView(
    chapterId: string,
    groupId: string,
  ): Promise<RushSettingsSkippedMember[]> {
    const [memberIds, access] = await Promise.all([
      this.groupRepo.findMemberIds(chapterId, groupId),
      this.rbac.getChapterMemberAccess(chapterId),
    ]);
    const viewers = new Set(
      access
        .filter((member) => canViewRush(member.permissions))
        .map((member) => member.user_id),
    );
    const skipped = memberIds.filter((id) => !viewers.has(id));
    if (skipped.length === 0) return [];
    const users = await this.userRepo.findByIds(skipped);
    const names = new Map(users.map((user) => [user.id, user.display_name]));
    return skipped
      .map((id) => ({
        user_id: id,
        display_name: names.get(id) ?? 'Unknown member',
      }))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }
}

function holdsEverything(role: Pick<Role, 'permissions'>): boolean {
  return role.permissions.includes('*');
}
