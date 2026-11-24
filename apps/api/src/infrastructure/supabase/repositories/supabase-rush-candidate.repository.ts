import { Inject, Injectable } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../supabase.provider';
import type { FrappSupabaseClient } from '../database.types';
import { PG_UNIQUE_VIOLATION } from '#domain/constants/postgres-error-codes';
import {
  RUSH_NAME_MATCHES_MAX,
  type IRushCandidateRepository,
} from '#domain/repositories/rush-candidate.repository.interface';
import type { RushCandidate } from '#domain/entities/rush-candidate.entity';
import { SupabaseQueryError } from '../supabase-query-error';

/**
 * The columns a {@link RushCandidate} carries. The card and the candidate
 * routes spread a candidate into their responses, so this never reads `*`:
 * the pipeline's owner, contact and follow-up columns (#5934) stay off a chat
 * card. `SupabaseRushPipelineRepository` reads those.
 */
const CANDIDATE_COLUMNS =
  'id, chapter_id, display_name, name_key, user_id, stage, closed_reason, bid_status, created_by, created_at';

@Injectable()
export class SupabaseRushCandidateRepository implements IRushCandidateRepository {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: FrappSupabaseClient,
  ) {}

  async findById(id: string, chapterId: string): Promise<RushCandidate | null> {
    const { data, error } = await this.supabase
      .from('rush_candidates')
      .select(CANDIDATE_COLUMNS)
      .eq('id', id)
      .eq('chapter_id', chapterId)
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async findByNameKey(
    chapterId: string,
    nameKey: string,
  ): Promise<RushCandidate[]> {
    // A list, not `.maybeSingle()`: two PNMs from the interest form may
    // share a name (#5977), and two rows must answer 409, never a 500.
    const { data, error } = await this.supabase
      .from('rush_candidates')
      .select(CANDIDATE_COLUMNS)
      .eq('chapter_id', chapterId)
      .eq('name_key', nameKey)
      .order('created_at', { ascending: true })
      .limit(RUSH_NAME_MATCHES_MAX);
    if (error) throw new SupabaseQueryError(error);
    return data ?? [];
  }

  async create(
    data: Omit<RushCandidate, 'id' | 'name_key' | 'created_at'> & {
      id?: string;
      created_at?: string;
    },
  ): Promise<RushCandidate> {
    const { data: created, error } = await this.supabase
      .from('rush_candidates')
      .insert({
        chapter_id: data.chapter_id,
        display_name: data.display_name,
        user_id: data.user_id,
        stage: data.stage,
        closed_reason: data.closed_reason,
        bid_status: data.bid_status,
        created_by: data.created_by,
        ...(data.id ? { id: data.id } : {}),
        ...(data.created_at ? { created_at: data.created_at } : {}),
      })
      .select(CANDIDATE_COLUMNS)
      .single();
    if (error) throw new SupabaseQueryError(error);
    return created;
  }

  async setBidExtended(id: string, chapterId: string): Promise<RushCandidate> {
    const { data, error } = await this.supabase
      .from('rush_candidates')
      .update({ bid_status: 'extended' })
      .eq('id', id)
      .eq('chapter_id', chapterId)
      .select(CANDIDATE_COLUMNS)
      .single();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async insertVote(
    candidateId: string,
    chapterId: string,
    voterId: string,
  ): Promise<'inserted' | 'duplicate'> {
    const { error } = await this.supabase.from('rush_candidate_votes').insert({
      candidate_id: candidateId,
      chapter_id: chapterId,
      voter_id: voterId,
    });
    if (error) {
      if (error.code === PG_UNIQUE_VIOLATION) {
        return 'duplicate';
      }
      throw new SupabaseQueryError(error);
    }
    return 'inserted';
  }

  async countVotes(candidateId: string, chapterId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('rush_candidate_votes')
      .select('*', { count: 'exact', head: true })
      .eq('candidate_id', candidateId)
      .eq('chapter_id', chapterId);
    if (error) throw new SupabaseQueryError(error);
    return count ?? 0;
  }

  async viewerHasVoted(
    candidateId: string,
    chapterId: string,
    voterId: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('rush_candidate_votes')
      .select('voter_id')
      .eq('candidate_id', candidateId)
      .eq('chapter_id', chapterId)
      .eq('voter_id', voterId)
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    return data != null;
  }
}
