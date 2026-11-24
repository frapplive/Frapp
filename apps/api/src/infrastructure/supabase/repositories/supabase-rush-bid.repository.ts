import { Inject, Injectable } from '@nestjs/common';
import { rushLegacyBidStatus } from '@repo/validation';
import { SUPABASE_CLIENT } from '../supabase.provider';
import type { FrappSupabaseClient } from '../database.types';
import { SupabaseQueryError } from '../supabase-query-error';
import type {
  IRushBidRepository,
  RushBidConfirmation,
  RushBidTransition,
} from '#domain/repositories/rush-bid.repository.interface';
import type { RushCandidateRow } from '#domain/entities/rush-candidate.entity';

@Injectable()
export class SupabaseRushBidRepository implements IRushBidRepository {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: FrappSupabaseClient,
  ) {}

  async transition(
    candidateId: string,
    chapterId: string,
    transition: RushBidTransition,
  ): Promise<RushCandidateRow | null> {
    const { set } = transition;
    let query = this.supabase
      .from('rush_candidates')
      .update({
        ...set,
        ...(set.bid_state
          ? { bid_status: rushLegacyBidStatus(set.bid_state) }
          : {}),
      })
      .eq('id', candidateId)
      .eq('chapter_id', chapterId)
      .in('bid_state', [...transition.from]);
    if (transition.open) {
      query = query.or(
        `bid_expires_at.is.null,bid_expires_at.gt.${transition.now}`,
      );
    }
    if (transition.recorded === true) {
      query = query.not('bid_acceptance_recorded_at', 'is', null);
    } else if (transition.recorded === false) {
      query = query.is('bid_acceptance_recorded_at', null);
    }
    const { data, error } = await query.select('*').maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async saveConfirmation(row: {
    candidateId: string;
    chapterId: string;
    email: string | null;
    tokenHash: string | null;
  }): Promise<void> {
    const { error } = await this.supabase.from('rush_bid_confirmations').upsert(
      {
        candidate_id: row.candidateId,
        chapter_id: row.chapterId,
        email: row.email,
        token_hash: row.tokenHash,
        emailed_at: null,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'candidate_id' },
    );
    if (error) throw new SupabaseQueryError(error);
  }

  async findConfirmation(
    candidateId: string,
    chapterId: string,
  ): Promise<RushBidConfirmation | null> {
    const { data, error } = await this.supabase
      .from('rush_bid_confirmations')
      .select('*')
      .eq('candidate_id', candidateId)
      .eq('chapter_id', chapterId)
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async findConfirmationByTokenHash(
    tokenHash: string,
  ): Promise<RushBidConfirmation | null> {
    const { data, error } = await this.supabase
      .from('rush_bid_confirmations')
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async deleteConfirmation(
    candidateId: string,
    chapterId: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('rush_bid_confirmations')
      .delete()
      .eq('candidate_id', candidateId)
      .eq('chapter_id', chapterId);
    if (error) throw new SupabaseQueryError(error);
  }

  async candidatesWithConfirmationEmail(
    chapterId: string,
  ): Promise<Set<string>> {
    const { data, error } = await this.supabase
      .from('rush_bid_confirmations')
      .select('candidate_id')
      .eq('chapter_id', chapterId)
      .not('emailed_at', 'is', null);
    if (error) throw new SupabaseQueryError(error);
    return new Set((data ?? []).map((row) => row.candidate_id));
  }

  async markConfirmationEmailed(
    candidateId: string,
    chapterId: string,
    at: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('rush_bid_confirmations')
      .update({ emailed_at: at })
      .eq('candidate_id', candidateId)
      .eq('chapter_id', chapterId);
    if (error) throw new SupabaseQueryError(error);
  }

  async setInviteSent(
    candidateId: string,
    chapterId: string,
    sent: boolean,
  ): Promise<RushCandidateRow | null> {
    const { data, error } = await this.supabase
      .from('rush_candidates')
      .update({ bid_invite_sent: sent })
      .eq('id', candidateId)
      .eq('chapter_id', chapterId)
      .eq('bid_state', 'accepted')
      .select('*')
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }
}
