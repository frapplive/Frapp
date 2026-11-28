import { Inject, Injectable } from '@nestjs/common';
import type { MeetingActionItemTaskLink } from '#domain/entities/meeting-action-item-task.entity';
import type { IMeetingActionItemTaskRepository } from '#domain/repositories/meeting-action-item-task.repository.interface';
import type { FrappSupabaseClient, TablesInsert } from '../database.types';
import { SUPABASE_CLIENT } from '../supabase.provider';
import { SupabaseQueryError } from '../supabase-query-error';

const UNIQUE_VIOLATION = '23505';

/**
 * `meeting_action_item_tasks` (#6062). RLS on and no policies: the API's
 * service role is the only reader, so every query filters on `chapter_id`.
 * The primary key `(meeting_id, item_key)` is what keeps an item to one task.
 */
@Injectable()
export class SupabaseMeetingActionItemTaskRepository implements IMeetingActionItemTaskRepository {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: FrappSupabaseClient,
  ) {}

  async claim(
    row: Pick<
      MeetingActionItemTaskLink,
      'meeting_id' | 'item_key' | 'chapter_id' | 'created_by'
    >,
    staleBefore: string,
  ): Promise<boolean> {
    if (await this.insert(row)) return true;
    // A claim nobody filled in (the API died between the two writes), or
    // one whose single task was deleted since, is taken over; one with its
    // task or group, or a fresh one, stands.
    const { data, error } = await this.supabase
      .from('meeting_action_item_tasks')
      .update({
        created_by: row.created_by,
        created_at: new Date().toISOString(),
      })
      .eq('chapter_id', row.chapter_id)
      .eq('meeting_id', row.meeting_id)
      .eq('item_key', row.item_key)
      .is('task_id', null)
      .is('task_group_id', null)
      .lt('created_at', staleBefore)
      .select('item_key');
    if (error) throw new SupabaseQueryError(error);
    return (data ?? []).length > 0;
  }

  private async insert(
    row: Pick<
      MeetingActionItemTaskLink,
      'meeting_id' | 'item_key' | 'chapter_id' | 'created_by'
    >,
  ): Promise<boolean> {
    const insert: TablesInsert<'meeting_action_item_tasks'> = row;
    const { error } = await this.supabase
      .from('meeting_action_item_tasks')
      .insert(insert);
    if (!error) return true;
    if (error.code === UNIQUE_VIOLATION) return false;
    throw new SupabaseQueryError(error);
  }

  async setTask(
    chapterId: string,
    meetingId: string,
    itemKey: string,
    task: { id: string; group_id: string | null },
  ): Promise<void> {
    const { error } = await this.supabase
      .from('meeting_action_item_tasks')
      .update({ task_id: task.id, task_group_id: task.group_id })
      .eq('chapter_id', chapterId)
      .eq('meeting_id', meetingId)
      .eq('item_key', itemKey);
    if (error) throw new SupabaseQueryError(error);
  }

  async release(
    chapterId: string,
    meetingId: string,
    itemKey: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('meeting_action_item_tasks')
      .delete()
      .eq('chapter_id', chapterId)
      .eq('meeting_id', meetingId)
      .eq('item_key', itemKey)
      .is('task_id', null)
      .is('task_group_id', null);
    if (error) throw new SupabaseQueryError(error);
  }

  async listForMeeting(
    chapterId: string,
    meetingId: string,
  ): Promise<MeetingActionItemTaskLink[]> {
    const { data, error } = await this.supabase
      .from('meeting_action_item_tasks')
      .select('*')
      .eq('chapter_id', chapterId)
      .eq('meeting_id', meetingId);
    if (error) throw new SupabaseQueryError(error);
    return data ?? [];
  }
}
