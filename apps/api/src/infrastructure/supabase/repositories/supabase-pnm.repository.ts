import { Inject, Injectable } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../supabase.provider';
import type { FrappSupabaseClient } from '../database.types';
import { SupabaseQueryError } from '../supabase-query-error';
import { fetchAllPages } from '../supabase.utils';
import { chunkIds } from '#domain/utils/chunk-ids';
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
/** Rows per page: the server's row cap (`max_rows`, 1000). */
const PAGE_SIZE = 1000;
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
    // A withdrawn registrant is off the list (ifc-recruitment.md: the
    // council stops seeing them). Paged: a big season passes the row cap.
    return fetchAllPages(
      (from, to) =>
        this.supabase
          .from('pnm_council_registrations')
          .select(REGISTRATION_COLUMNS)
          .eq('council_id', councilId)
          .eq('term', term)
          .neq('status', 'withdrawn')
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      { pageSize: PAGE_SIZE },
    );
  }

  async findRegistrantIds(
    councilId: string,
    pnmIds: string[],
  ): Promise<string[]> {
    const ids = new Set<string>();
    for (const chunk of chunkIds([...new Set(pnmIds)])) {
      const { data, error } = await this.supabase
        .from('pnm_council_registrations')
        .select('pnm_id')
        .eq('council_id', councilId)
        .neq('status', 'withdrawn')
        .in('pnm_id', chunk);
      if (error) throw new SupabaseQueryError(error);
      for (const row of data ?? []) ids.add(row.pnm_id);
    }
    return [...ids];
  }

  async findAllRegistrantIds(councilId: string): Promise<string[]> {
    const rows = await fetchAllPages(
      (from, to) =>
        this.supabase
          .from('pnm_council_registrations')
          .select('id, pnm_id')
          .eq('council_id', councilId)
          .neq('status', 'withdrawn')
          .order('id', { ascending: true })
          .range(from, to),
      { pageSize: PAGE_SIZE },
    );
    return [...new Set(rows.map((row) => row.pnm_id))];
  }

  async findLivePnmsAtSchool(
    schoolId: string,
    pnmIds: string[],
  ): Promise<Pnm[]> {
    const rows: Pnm[] = [];
    for (const chunk of chunkIds([...new Set(pnmIds)])) {
      const { data, error } = await this.supabase
        .from('pnms')
        .select(PNM_COLUMNS)
        .eq('school_id', schoolId)
        .is('merged_into_id', null)
        .in('id', chunk);
      if (error) throw new SupabaseQueryError(error);
      rows.push(...(data ?? []));
    }
    return rows;
  }

  async findInterests(
    pnmIds: string[],
    chapterIds: string[],
    createdBy?: string,
  ): Promise<PnmInterest[]> {
    if (!chapterIds.length) return [];
    const rows: PnmInterest[] = [];
    for (const chunk of chunkIds([...new Set(pnmIds)])) {
      rows.push(
        ...(await fetchAllPages(
          (from, to) => {
            let query = this.supabase
              .from('pnm_interests')
              .select(INTEREST_COLUMNS)
              .in('pnm_id', chunk)
              .in('chapter_id', chapterIds)
              .is('withdrawn_at', null);
            if (createdBy) query = query.lte('created_at', createdBy);
            return query.order('id', { ascending: true }).range(from, to);
          },
          { pageSize: PAGE_SIZE },
        )),
      );
    }
    return rows;
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
