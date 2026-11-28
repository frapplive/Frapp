import { Inject, Injectable } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../supabase.provider';
import type { FrappSupabaseClient, TablesInsert } from '../database.types';
import type {
  ActivityItemRef,
  ActivityPageReads,
  IActivityItemReadRepository,
} from '#domain/repositories/activity-item-read.repository.interface';
import type { ActivityItemRead } from '#domain/entities/activity-item-read.entity';
import { SupabaseQueryError } from '../supabase-query-error';
import { chunkIds } from '#domain/utils/chunk-ids';

/**
 * The upsert targets, each the primary key of its table in
 * `20261111220000_activity_item_reads.sql`. A target that names no unique
 * constraint fails every write with 42P10, which no mocked client notices,
 * so `supabase-activity-item-read.repository.spec.ts` checks these against
 * the migration.
 */
export const ACTIVITY_ITEM_READS_CONFLICT = 'user_id,chapter_id,kind,item_id';
export const ACTIVITY_UNREAD_STARTS_CONFLICT = 'user_id,chapter_id';
/** The primary key of `activity_item_snoozes` (`20261114154540_activity_item_snoozes.sql`). */
export const ACTIVITY_ITEM_SNOOZES_CONFLICT = 'user_id,chapter_id,kind,item_id';

/**
 * `activity_item_reads` and `activity_unread_starts` (#4173), and
 * `activity_item_snoozes` (#4982). RLS on and no
 * policies: the API's service role is the only reader, and every query here
 * filters on `chapter_id` and `user_id` because nothing else would.
 */
@Injectable()
export class SupabaseActivityItemReadRepository implements IActivityItemReadRepository {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: FrappSupabaseClient,
  ) {}

  /**
   * One call to `activity_page_reads` (#6061 step 2). The function's rows are
   * the columns the separate reads selected, so they are served as typed.
   */
  async readPage(
    chapterId: string,
    userId: string,
    query: {
      now: string;
      snoozesEndedAfter: string;
      polls: boolean;
      pollLimit: number;
      cardLimit: number;
      reminderLimit: number;
    },
  ): Promise<ActivityPageReads> {
    const { data, error } = await this.supabase.rpc('activity_page_reads', {
      p_chapter_id: chapterId,
      p_user_id: userId,
      p_now: query.now,
      p_snoozes_ended_after: query.snoozesEndedAfter,
      p_polls: query.polls,
      p_poll_limit: query.pollLimit,
      p_card_limit: query.cardLimit,
      p_reminder_limit: query.reminderLimit,
    });
    if (error) throw new SupabaseQueryError(error);
    if (!data) throw new Error('activity_page_reads returned nothing');
    return data;
  }

  async startUnread(
    chapterId: string,
    userId: string,
    startedAt: string,
  ): Promise<void> {
    const row: TablesInsert<'activity_unread_starts'> = {
      user_id: userId,
      chapter_id: chapterId,
      started_at: startedAt,
    };
    // Set once: a later load must not move it, or a row the member never
    // opened would stop being unread.
    const { error } = await this.supabase
      .from('activity_unread_starts')
      .upsert(row, {
        onConflict: ACTIVITY_UNREAD_STARTS_CONFLICT,
        ignoreDuplicates: true,
      });
    if (error) throw new SupabaseQueryError(error);
  }

  /**
   * The ids go out in `chunkIds` batches: Activity serves up to 135 rows, and
   * one `in` list of that many uuids is near the URL limit (#3265).
   */
  async findReads(
    chapterId: string,
    userId: string,
    itemIds: string[],
  ): Promise<ActivityItemRead[]> {
    const batches = await Promise.all(
      chunkIds(itemIds).map(async (ids) => {
        const { data, error } = await this.supabase
          .from('activity_item_reads')
          .select('*')
          .eq('chapter_id', chapterId)
          .eq('user_id', userId)
          .in('item_id', ids);
        if (error) throw new SupabaseQueryError(error);
        return data ?? [];
      }),
    );
    return batches.flat();
  }

  async markRead(
    chapterId: string,
    userId: string,
    items: ActivityItemRef[],
    readAt: string,
  ): Promise<void> {
    if (items.length === 0) return;
    const rows: TablesInsert<'activity_item_reads'>[] = items.map((item) => ({
      user_id: userId,
      chapter_id: chapterId,
      kind: item.kind,
      item_id: item.item_id,
      read_at: readAt,
    }));
    const { error } = await this.supabase
      .from('activity_item_reads')
      .upsert(rows, { onConflict: ACTIVITY_ITEM_READS_CONFLICT });
    if (error) throw new SupabaseQueryError(error);
  }

  async snooze(
    chapterId: string,
    userId: string,
    item: ActivityItemRef,
    until: string,
  ): Promise<void> {
    const row: TablesInsert<'activity_item_snoozes'> = {
      user_id: userId,
      chapter_id: chapterId,
      kind: item.kind,
      item_id: item.item_id,
      until,
      // A new snooze, so it is new from now, not from the one it replaces.
      created_at: new Date().toISOString(),
    };
    const { error } = await this.supabase
      .from('activity_item_snoozes')
      .upsert(row, { onConflict: ACTIVITY_ITEM_SNOOZES_CONFLICT });
    if (error) throw new SupabaseQueryError(error);
  }

  async unsnooze(
    chapterId: string,
    userId: string,
    item: ActivityItemRef,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('activity_item_snoozes')
      .delete()
      .eq('chapter_id', chapterId)
      .eq('user_id', userId)
      .eq('kind', item.kind)
      .eq('item_id', item.item_id);
    if (error) throw new SupabaseQueryError(error);
  }
}
