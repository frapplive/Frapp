import { Inject, Injectable } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../supabase.provider';
import type { FrappSupabaseClient } from '../database.types';
import { SupabaseQueryError } from '../supabase-query-error';
import { PG_UNIQUE_VIOLATION } from '#domain/constants/postgres-error-codes';
import type {
  IPnmRepository,
  PnmAccessLogEntry,
  SeasonInsert,
  SeasonPatch,
} from '#domain/repositories/pnm.repository.interface';
import type {
  CouncilRecruitmentSeason,
  Pnm,
  PnmCouncilRegistration,
  PnmDuplicateDismissal,
  PnmInterest,
  PnmMergeResult,
} from '#domain/entities/pnm.entity';

const SEASON_COLUMNS =
  'council_id, term, opens_at, closes_at, bid_window_opens_at, bid_window_closes_at, status, pnm_retention_days, created_at, updated_at';
const PNM_COLUMNS =
  'id, school_id, user_id, school_email, email_verified_at, first_name, last_name, preferred_name, class_year, phone, phone_shared, merged_into_id, created_via, created_at, updated_at';
const REGISTRATION_COLUMNS = 'id, pnm_id, council_id, term, status, created_at';
const INTEREST_COLUMNS =
  'id, pnm_id, chapter_id, registration_id, source, source_label, created_at, withdrawn_at';

/**
 * PNM records (#5974, `school-layer.md` § 2.5 and § 4.2 rule 4). Council
 * reads filter on the council id (seasons, registrations, dismissals) and
 * PNMs on the council's school; chapter reads on the chapter id. No read
 * here touches `rush_candidates` beyond whether a chapter's own candidate is
 * linked, and none returns a chapter's pipeline.
 */
@Injectable()
export class SupabasePnmRepository implements IPnmRepository {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: FrappSupabaseClient,
  ) {}

  async findSeasons(councilId: string): Promise<CouncilRecruitmentSeason[]> {
    const { data, error } = await this.supabase
      .from('council_recruitment_seasons')
      .select(SEASON_COLUMNS)
      .eq('council_id', councilId)
      .order('opens_at', { ascending: false });
    if (error) throw new SupabaseQueryError(error);
    return data ?? [];
  }

  async findSeason(
    councilId: string,
    term: string,
  ): Promise<CouncilRecruitmentSeason | null> {
    const { data, error } = await this.supabase
      .from('council_recruitment_seasons')
      .select(SEASON_COLUMNS)
      .eq('council_id', councilId)
      .eq('term', term)
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async createSeason(
    row: SeasonInsert,
  ): Promise<CouncilRecruitmentSeason | null> {
    const { data, error } = await this.supabase
      .from('council_recruitment_seasons')
      .insert(row)
      .select(SEASON_COLUMNS)
      .single();
    if (error?.code === PG_UNIQUE_VIOLATION) return null;
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async updateSeason(
    councilId: string,
    term: string,
    patch: SeasonPatch,
  ): Promise<CouncilRecruitmentSeason | null> {
    const { data, error } = await this.supabase
      .from('council_recruitment_seasons')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('council_id', councilId)
      .eq('term', term)
      .select(SEASON_COLUMNS)
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async findRegistrations(
    councilId: string,
    term: string,
  ): Promise<PnmCouncilRegistration[]> {
    const { data, error } = await this.supabase
      .from('pnm_council_registrations')
      .select(REGISTRATION_COLUMNS)
      .eq('council_id', councilId)
      .eq('term', term)
      .order('created_at', { ascending: true });
    if (error) throw new SupabaseQueryError(error);
    return data ?? [];
  }

  async findRegistrantIds(
    councilId: string,
    pnmIds: string[],
  ): Promise<string[]> {
    if (!pnmIds.length) return [];
    const { data, error } = await this.supabase
      .from('pnm_council_registrations')
      .select('pnm_id')
      .eq('council_id', councilId)
      .in('pnm_id', pnmIds);
    if (error) throw new SupabaseQueryError(error);
    return [...new Set((data ?? []).map((row) => row.pnm_id))];
  }

  async findAllRegistrantIds(councilId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('pnm_council_registrations')
      .select('pnm_id')
      .eq('council_id', councilId);
    if (error) throw new SupabaseQueryError(error);
    return [...new Set((data ?? []).map((row) => row.pnm_id))];
  }

  async findLivePnmsAtSchool(
    schoolId: string,
    pnmIds: string[],
  ): Promise<Pnm[]> {
    if (!pnmIds.length) return [];
    const { data, error } = await this.supabase
      .from('pnms')
      .select(PNM_COLUMNS)
      .eq('school_id', schoolId)
      .is('merged_into_id', null)
      .in('id', pnmIds);
    if (error) throw new SupabaseQueryError(error);
    return data ?? [];
  }

  async findInterests(
    pnmIds: string[],
    chapterIds: string[],
  ): Promise<PnmInterest[]> {
    if (!pnmIds.length || !chapterIds.length) return [];
    const { data, error } = await this.supabase
      .from('pnm_interests')
      .select(INTEREST_COLUMNS)
      .in('pnm_id', pnmIds)
      .in('chapter_id', chapterIds)
      .is('withdrawn_at', null);
    if (error) throw new SupabaseQueryError(error);
    return data ?? [];
  }

  async logCouncilAccess(
    councilId: string,
    actorUserId: string,
    entries: PnmAccessLogEntry[],
  ): Promise<void> {
    if (!entries.length) return;
    const { error } = await this.supabase.from('council_pnm_access_log').insert(
      entries.map((entry) => ({
        council_id: councilId,
        actor_user_id: actorUserId,
        pnm_id: entry.pnmId,
        fields: entry.fields,
      })),
    );
    if (error) throw new SupabaseQueryError(error);
  }

  async findDismissals(councilId: string): Promise<PnmDuplicateDismissal[]> {
    const { data, error } = await this.supabase
      .from('pnm_duplicate_dismissals')
      .select('council_id, pnm_a, pnm_b, dismissed_by, created_at')
      .eq('council_id', councilId);
    if (error) throw new SupabaseQueryError(error);
    return data ?? [];
  }

  async dismissDuplicate(
    councilId: string,
    a: string,
    b: string,
    actorUserId: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('pnm_duplicate_dismissals')
      .upsert(
        {
          council_id: councilId,
          pnm_a: a,
          pnm_b: b,
          dismissed_by: actorUserId,
        },
        { onConflict: 'council_id,pnm_a,pnm_b', ignoreDuplicates: true },
      );
    if (error) throw new SupabaseQueryError(error);
  }

  async merge(
    councilId: string,
    survivorId: string,
    loserId: string,
    actorUserId: string,
  ): Promise<PnmMergeResult> {
    const { data, error } = await this.supabase.rpc('merge_pnms', {
      p_council_id: councilId,
      p_survivor: survivorId,
      p_loser: loserId,
      p_actor: actorUserId,
    });
    if (error) throw new SupabaseQueryError(error);
    return data as unknown as PnmMergeResult;
  }

  async findLivePnm(pnmId: string): Promise<Pnm | null> {
    const { data, error } = await this.supabase
      .from('pnms')
      .select(PNM_COLUMNS)
      .eq('id', pnmId)
      .is('merged_into_id', null)
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async isLinkedToChapter(chapterId: string, pnmId: string): Promise<boolean> {
    const interest = await this.supabase
      .from('pnm_interests')
      .select('id')
      .eq('chapter_id', chapterId)
      .eq('pnm_id', pnmId)
      .is('withdrawn_at', null)
      .maybeSingle();
    if (interest.error) throw new SupabaseQueryError(interest.error);
    if (interest.data) return true;
    const candidate = await this.supabase
      .from('rush_candidates')
      .select('id')
      .eq('chapter_id', chapterId)
      .eq('pnm_id', pnmId)
      .maybeSingle();
    if (candidate.error) throw new SupabaseQueryError(candidate.error);
    return candidate.data !== null;
  }

  async purgeExpired(now: Date): Promise<number> {
    const { data, error } = await this.supabase.rpc('purge_expired_pnms', {
      p_now: now.toISOString(),
    });
    if (error) throw new SupabaseQueryError(error);
    return data ?? 0;
  }
}
