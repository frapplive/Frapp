import { Inject, Injectable } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../supabase.provider';
import type { FrappSupabaseClient } from '../database.types';
import type { TaskExtensionRequest } from '#domain/entities/task-extension-request.entity';
import type {
  ExtensionStanding,
  ITaskExtensionRequestRepository,
  NewTaskExtensionRequest,
  TaskExtensionDecision,
} from '#domain/repositories/task-extension-request.repository.interface';
import { SupabaseQueryError } from '../supabase-query-error';

/** Postgres `unique_violation`. */
const UNIQUE_VIOLATION = '23505';

@Injectable()
export class SupabaseTaskExtensionRequestRepository implements ITaskExtensionRequestRepository {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: FrappSupabaseClient,
  ) {}

  async create(
    row: NewTaskExtensionRequest,
  ): Promise<TaskExtensionRequest | null> {
    const { data, error } = await this.supabase
      .from('task_extension_requests')
      .insert(row)
      .select()
      .single();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) return null;
      throw new SupabaseQueryError(error);
    }
    return data;
  }

  async findById(
    chapterId: string,
    id: string,
  ): Promise<TaskExtensionRequest | null> {
    const { data, error } = await this.supabase
      .from('task_extension_requests')
      .select('*')
      .eq('chapter_id', chapterId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async listForTask(
    chapterId: string,
    taskId: string,
  ): Promise<TaskExtensionRequest[]> {
    const { data, error } = await this.supabase
      .from('task_extension_requests')
      .select('*')
      .eq('chapter_id', chapterId)
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });
    if (error) throw new SupabaseQueryError(error);
    return data ?? [];
  }

  async latestForTasks(
    chapterId: string,
    taskIds: string[],
  ): Promise<Map<string, TaskExtensionRequest>> {
    const latest = new Map<string, TaskExtensionRequest>();
    if (taskIds.length === 0) return latest;
    const { data, error } = await this.supabase
      .from('task_extension_requests')
      .select('*')
      .eq('chapter_id', chapterId)
      .in('task_id', taskIds)
      .order('created_at', { ascending: false });
    if (error) throw new SupabaseQueryError(error);
    for (const row of data ?? []) {
      if (!latest.has(row.task_id)) latest.set(row.task_id, row);
    }
    return latest;
  }

  async listPending(
    chapterId: string,
    limit: number,
    exceptRequester: string,
  ): Promise<TaskExtensionRequest[]> {
    const { data, error } = await this.supabase
      .from('task_extension_requests')
      .select('*')
      .eq('chapter_id', chapterId)
      .neq('requester_id', exceptRequester)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) throw new SupabaseQueryError(error);
    return data ?? [];
  }

  async decide(
    chapterId: string,
    id: string,
    decision: TaskExtensionDecision,
  ): Promise<TaskExtensionRequest | null> {
    const { data, error } = await this.supabase
      .from('task_extension_requests')
      .update(decision)
      .eq('chapter_id', chapterId)
      .eq('id', id)
      .eq('status', 'pending')
      .select()
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async withdrawPending(chapterId: string, taskId: string): Promise<void> {
    const { error } = await this.supabase
      .from('task_extension_requests')
      .update({ status: 'withdrawn', decided_at: new Date().toISOString() })
      .eq('chapter_id', chapterId)
      .eq('task_id', taskId)
      .eq('status', 'pending');
    if (error) throw new SupabaseQueryError(error);
  }

  async reopen(chapterId: string, id: string): Promise<void> {
    const { error } = await this.supabase
      .from('task_extension_requests')
      .update({
        status: 'pending',
        decided_by: null,
        decided_at: null,
        decline_reason: null,
        auto_approved: false,
      })
      .eq('chapter_id', chapterId)
      .eq('id', id);
    if (error) throw new SupabaseQueryError(error);
  }

  async countApprovedSince(
    chapterId: string,
    requesterId: string,
    since: string,
  ): Promise<number> {
    const { count, error } = await this.supabase
      .from('task_extension_requests')
      .select('id', { count: 'exact', head: true })
      .eq('chapter_id', chapterId)
      .eq('requester_id', requesterId)
      .eq('status', 'approved')
      .gt('decided_at', since);
    if (error) throw new SupabaseQueryError(error);
    return count ?? 0;
  }

  async previousSeriesCopyId(
    chapterId: string,
    seriesId: string,
    occurrenceDate: string,
  ): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('tasks')
      .select('id')
      .eq('chapter_id', chapterId)
      .eq('series_id', seriesId)
      .lt('occurrence_date', occurrenceDate)
      .order('occurrence_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    return data?.id ?? null;
  }

  async standing(
    chapterId: string,
    userId: string,
  ): Promise<ExtensionStanding | null> {
    const { data, error } = await this.supabase
      .from('members')
      .select('extension_requests_blocked_at, extension_requests_restored_at')
      .eq('chapter_id', chapterId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    if (!data) return null;
    return {
      blocked_at: data.extension_requests_blocked_at ?? null,
      restored_at: data.extension_requests_restored_at ?? null,
    };
  }

  async block(chapterId: string, userId: string, at: string): Promise<void> {
    const { error } = await this.supabase
      .from('members')
      .update({ extension_requests_blocked_at: at })
      .eq('chapter_id', chapterId)
      .eq('user_id', userId)
      .is('extension_requests_blocked_at', null);
    if (error) throw new SupabaseQueryError(error);
  }

  async restore(
    chapterId: string,
    userId: string,
    at: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('members')
      .update({
        extension_requests_blocked_at: null,
        extension_requests_restored_at: at,
      })
      .eq('chapter_id', chapterId)
      .eq('user_id', userId)
      .not('extension_requests_blocked_at', 'is', null)
      .select('id');
    if (error) throw new SupabaseQueryError(error);
    return (data ?? []).length > 0;
  }

  async listBlocked(
    chapterId: string,
  ): Promise<{ user_id: string; blocked_at: string }[]> {
    const { data, error } = await this.supabase
      .from('members')
      .select('user_id, extension_requests_blocked_at')
      .eq('chapter_id', chapterId)
      .not('extension_requests_blocked_at', 'is', null)
      .order('extension_requests_blocked_at', { ascending: false });
    if (error) throw new SupabaseQueryError(error);
    return (data ?? []).flatMap((row) =>
      row.extension_requests_blocked_at
        ? [
            {
              user_id: row.user_id,
              blocked_at: row.extension_requests_blocked_at,
            },
          ]
        : [],
    );
  }
}
