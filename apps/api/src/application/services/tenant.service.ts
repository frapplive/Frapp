import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { TenantKind } from '@repo/validation';
import {
  TENANT_SLUG_REPOSITORY,
  type ITenantSlugRepository,
} from '#domain/repositories/tenant-slug.repository.interface';
import {
  MEMBER_REPOSITORY,
  type IMemberRepository,
} from '#domain/repositories/member.repository.interface';
import {
  CHAPTER_REPOSITORY,
  type IChapterRepository,
} from '#domain/repositories/chapter.repository.interface';

export interface ResolvedTenant {
  id: string;
  name: string;
  kind: TenantKind;
  slug: string;
  redirected: boolean;
}

/**
 * The one answer for every slug the caller may not open. Unknown, another
 * tenant's current slug, another tenant's retired slug and a malformed slug
 * all get exactly this, so `resolve` can't be used to learn which chapters
 * are on Frapp or what they renamed to (ADR-27 § Consequences, API).
 */
function tenantNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'tenant.not_found',
    message: 'No chapter of yours has that address.',
  });
}

@Injectable()
export class TenantService {
  constructor(
    @Inject(TENANT_SLUG_REPOSITORY)
    private readonly slugs: ITenantSlugRepository,
    @Inject(MEMBER_REPOSITORY) private readonly members: IMemberRepository,
    @Inject(CHAPTER_REPOSITORY) private readonly chapters: IChapterRepository,
  ) {}

  /**
   * The tenant a slug names, for a member of it only (ADR-27, #5918). A slug
   * the tenant has retired resolves to the tenant with its current slug and
   * `redirected: true`, so an old link or bookmark still opens.
   */
  async resolve(userId: string, rawSlug: string): Promise<ResolvedTenant> {
    const slug = rawSlug.trim().toLowerCase();
    const row = await this.slugs.findBySlug(slug);
    // A slug whose tenant was deleted keeps its row with no owner.
    if (!row?.chapter_id) throw tenantNotFound();

    const chapterId = row.chapter_id;
    const membership = await this.members.findByUserAndChapter(
      userId,
      chapterId,
    );
    if (!membership) throw tenantNotFound();

    const [chapter, current] = await Promise.all([
      this.chapters.findById(chapterId),
      row.retired_at === null
        ? Promise.resolve(row)
        : this.slugs
            .findCurrentByChapterIds([chapterId])
            .then((rows) => rows[0] ?? null),
    ]);
    if (!chapter || !current) throw tenantNotFound();

    return {
      id: chapter.id,
      name: chapter.name,
      kind: chapter.kind ?? 'chapter',
      slug: current.slug,
      redirected: current.slug !== slug,
    };
  }
}
