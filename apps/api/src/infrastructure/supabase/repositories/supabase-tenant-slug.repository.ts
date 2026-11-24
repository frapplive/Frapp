import { Inject, Injectable } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../supabase.provider';
import type { FrappSupabaseClient } from '../database.types';
import type { ITenantSlugRepository } from '#domain/repositories/tenant-slug.repository.interface';
import type { TenantSlug } from '#domain/entities/tenant-slug.entity';
import { SupabaseQueryError } from '../supabase-query-error';

@Injectable()
export class SupabaseTenantSlugRepository implements ITenantSlugRepository {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: FrappSupabaseClient,
  ) {}

  async findBySlug(slug: string): Promise<TenantSlug | null> {
    const { data, error } = await this.supabase
      .from('tenant_slugs')
      .select('slug, chapter_id, retired_at, created_at')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async findCurrentByChapterIds(chapterIds: string[]): Promise<TenantSlug[]> {
    if (!chapterIds.length) return [];
    const { data, error } = await this.supabase
      .from('tenant_slugs')
      .select('slug, chapter_id, retired_at, created_at')
      .in('chapter_id', chapterIds)
      .is('retired_at', null);
    if (error) throw new SupabaseQueryError(error);
    return data ?? [];
  }
}
