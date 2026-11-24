import { Inject, Injectable } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../supabase.provider';
import type { FrappSupabaseClient } from '../database.types';
import { SupabaseQueryError } from '../supabase-query-error';
import { PG_UNIQUE_VIOLATION } from '#domain/constants/postgres-error-codes';
import type {
  IAffiliationRepository,
  SchoolChapterStatusResult,
  TenantListing,
} from '#domain/repositories/affiliation.repository.interface';
import type {
  AffiliationSide,
  CouncilChapter,
  CouncilChapterStatus,
  CouncilChapterStatusResult,
} from '#domain/entities/council-chapter.entity';
import type {
  SchoolChapter,
  SchoolChapterStatus,
} from '#domain/entities/school.entity';

const SCHOOL_LINK_COLUMNS =
  'id, school_id, chapter_id, is_primary, status, proposed_by, confirmed_by, confirmed_at, ended_at, created_at';
const COUNCIL_LINK_COLUMNS =
  'id, council_id, chapter_id, status, proposed_by_side, proposed_by, decided_by, decided_at, created_at';
const LISTING_COLUMNS =
  'id, name, kind, org_archetype, university, council_type, council_school_id, council_verified_at, recruitment_model';
const LIVE_COUNCIL_LINK = ['proposed', 'accepted', 'suspended'] as const;

/**
 * Affiliations (#5974, `school-layer.md` § 2.4). Every read filters on the
 * tenant it serves; a single link is read by its id **and** that tenant, so
 * another tenant's link id finds nothing. Writes go through
 * `set_school_chapter_status` and `set_council_chapter_status`, which hold
 * the transition rules and the shared-school check.
 */
@Injectable()
export class SupabaseAffiliationRepository implements IAffiliationRepository {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: FrappSupabaseClient,
  ) {}

  async findLiveSchoolLinks(chapterId: string): Promise<SchoolChapter[]> {
    const { data, error } = await this.supabase
      .from('school_chapters')
      .select(SCHOOL_LINK_COLUMNS)
      .eq('chapter_id', chapterId)
      .in('status', ['proposed', 'active'])
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) throw new SupabaseQueryError(error);
    return data ?? [];
  }

  async proposeSchoolLink(
    chapterId: string,
    schoolId: string,
    proposedBy: string,
  ): Promise<boolean> {
    const { error } = await this.supabase.from('school_chapters').insert({
      school_id: schoolId,
      chapter_id: chapterId,
      status: 'proposed',
      proposed_by: proposedBy,
    });
    if (error?.code === PG_UNIQUE_VIOLATION) return false;
    if (error) throw new SupabaseQueryError(error);
    return true;
  }

  async setSchoolLinkStatus(
    chapterId: string,
    linkId: string,
    status: Exclude<SchoolChapterStatus, 'proposed'>,
    actor: string,
  ): Promise<SchoolChapterStatusResult> {
    const { data, error } = await this.supabase.rpc(
      'set_school_chapter_status',
      {
        p_link_id: linkId,
        p_chapter_id: chapterId,
        p_status: status,
        p_actor: actor,
      },
    );
    if (error) throw new SupabaseQueryError(error);
    return data as unknown as SchoolChapterStatusResult;
  }

  async findLiveLinksForCouncil(councilId: string): Promise<CouncilChapter[]> {
    const { data, error } = await this.supabase
      .from('council_chapters')
      .select(COUNCIL_LINK_COLUMNS)
      .eq('council_id', councilId)
      .in('status', [...LIVE_COUNCIL_LINK])
      .order('created_at', { ascending: false });
    if (error) throw new SupabaseQueryError(error);
    return data ?? [];
  }

  async findLiveLinksForChapter(chapterId: string): Promise<CouncilChapter[]> {
    const { data, error } = await this.supabase
      .from('council_chapters')
      .select(COUNCIL_LINK_COLUMNS)
      .eq('chapter_id', chapterId)
      .in('status', [...LIVE_COUNCIL_LINK])
      .order('created_at', { ascending: false });
    if (error) throw new SupabaseQueryError(error);
    return data ?? [];
  }

  async findCouncilLink(
    councilId: string,
    linkId: string,
  ): Promise<CouncilChapter | null> {
    const { data, error } = await this.supabase
      .from('council_chapters')
      .select(COUNCIL_LINK_COLUMNS)
      .eq('council_id', councilId)
      .eq('id', linkId)
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async findChapterLink(
    chapterId: string,
    linkId: string,
  ): Promise<CouncilChapter | null> {
    const { data, error } = await this.supabase
      .from('council_chapters')
      .select(COUNCIL_LINK_COLUMNS)
      .eq('chapter_id', chapterId)
      .eq('id', linkId)
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async setCouncilLinkStatus(
    councilId: string,
    chapterId: string,
    side: AffiliationSide,
    status: CouncilChapterStatus,
    actor: string,
  ): Promise<CouncilChapterStatusResult> {
    const { data, error } = await this.supabase.rpc(
      'set_council_chapter_status',
      {
        p_council_id: councilId,
        p_chapter_id: chapterId,
        p_side: side,
        p_status: status,
        p_actor: actor,
      },
    );
    if (error) throw new SupabaseQueryError(error);
    return data as unknown as CouncilChapterStatusResult;
  }

  async findActiveChapterIdsAtSchool(schoolId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('school_chapters')
      .select('chapter_id')
      .eq('school_id', schoolId)
      .eq('status', 'active');
    if (error) throw new SupabaseQueryError(error);
    return (data ?? []).map((row) => row.chapter_id);
  }

  async findCouncilsAtSchools(schoolIds: string[]): Promise<TenantListing[]> {
    if (!schoolIds.length) return [];
    const { data, error } = await this.supabase
      .from('chapters')
      .select(LISTING_COLUMNS)
      .eq('kind', 'council')
      .in('council_school_id', schoolIds)
      .order('name', { ascending: true });
    if (error) throw new SupabaseQueryError(error);
    return (data ?? []).map(toListing);
  }

  async findListings(tenantIds: string[]): Promise<TenantListing[]> {
    if (!tenantIds.length) return [];
    const { data, error } = await this.supabase
      .from('chapters')
      .select(LISTING_COLUMNS)
      .in('id', tenantIds);
    if (error) throw new SupabaseQueryError(error);
    return (data ?? []).map(toListing);
  }
}

function toListing(row: {
  id: string;
  name: string;
  kind?: string | null;
  org_archetype?: string | null;
  university: string;
  council_type?: TenantListing['council_type'] | null;
  council_school_id?: string | null;
  council_verified_at?: string | null;
  recruitment_model?: TenantListing['recruitment_model'] | null;
}): TenantListing {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind === 'council' ? 'council' : 'chapter',
    org_archetype: row.org_archetype ?? null,
    university: row.university,
    council_type: row.council_type ?? null,
    council_school_id: row.council_school_id ?? null,
    council_verified_at: row.council_verified_at ?? null,
    recruitment_model: row.recruitment_model ?? null,
  };
}
