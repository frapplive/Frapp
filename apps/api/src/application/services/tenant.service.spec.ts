import { NotFoundException } from '@nestjs/common';
import { TenantService } from './tenant.service';
import type { ITenantSlugRepository } from '#domain/repositories/tenant-slug.repository.interface';
import type { IMemberRepository } from '#domain/repositories/member.repository.interface';
import type { IChapterRepository } from '#domain/repositories/chapter.repository.interface';
import type { TenantSlug } from '#domain/entities/tenant-slug.entity';
import { chapterFixture, memberFixture } from '#test/helpers/entity-fixtures';

const MINE = 'chapter-mine';
const THEIRS = 'chapter-theirs';

const SLUGS: TenantSlug[] = [
  { slug: 'mine-rpi', chapter_id: MINE, retired_at: null, created_at: '' },
  {
    slug: 'mine-old',
    chapter_id: MINE,
    retired_at: '2026-11-01T00:00:00Z',
    created_at: '',
  },
  { slug: 'theirs-rpi', chapter_id: THEIRS, retired_at: null, created_at: '' },
  {
    slug: 'theirs-old',
    chapter_id: THEIRS,
    retired_at: '2026-11-01T00:00:00Z',
    created_at: '',
  },
  { slug: 'gone-rpi', chapter_id: null, retired_at: null, created_at: '' },
];

describe('TenantService.resolve (ADR-27, #5918)', () => {
  let service: TenantService;
  let members: jest.Mocked<IMemberRepository>;
  let slugs: jest.Mocked<ITenantSlugRepository>;

  beforeEach(() => {
    slugs = {
      findBySlug: jest.fn(async (slug: string) =>
        structuredClone(SLUGS.find((row) => row.slug === slug) ?? null),
      ),
      findCurrentByChapterIds: jest.fn(async (ids: string[]) =>
        SLUGS.filter(
          (row) =>
            row.chapter_id !== null &&
            ids.includes(row.chapter_id) &&
            row.retired_at === null,
        ),
      ),
    };
    members = {
      findByUser: jest.fn(async () => [memberFixture({ chapter_id: MINE })]),
    } as unknown as jest.Mocked<IMemberRepository>;
    const chapters = {
      findById: jest.fn(async (id: string) =>
        chapterFixture({ id, name: 'Mine', kind: 'council' }),
      ),
    } as unknown as IChapterRepository;
    service = new TenantService(slugs, members, chapters);
  });

  it('resolves a current slug of the caller’s own tenant', async () => {
    await expect(service.resolve('user-1', 'mine-rpi')).resolves.toEqual({
      id: MINE,
      name: 'Mine',
      kind: 'council',
      slug: 'mine-rpi',
      redirected: false,
    });
  });

  it('matches a slug in any case', async () => {
    await expect(service.resolve('user-1', 'Mine-RPI')).resolves.toMatchObject({
      id: MINE,
      redirected: false,
    });
  });

  it('redirects the caller’s own retired slug to the current one', async () => {
    await expect(service.resolve('user-1', 'mine-old')).resolves.toMatchObject({
      id: MINE,
      slug: 'mine-rpi',
      redirected: true,
    });
  });

  it('reads the slug and the caller’s memberships for an unknown slug as for another tenant’s', async () => {
    await service.resolve('user-1', 'nobody-here').catch(() => undefined);
    await service.resolve('user-1', 'theirs-rpi').catch(() => undefined);

    // Same reads on both paths, so timing can't tell them apart.
    expect(slugs.findBySlug).toHaveBeenCalledTimes(2);
    expect(members.findByUser).toHaveBeenCalledTimes(2);
  });

  it('asks the database nothing for a reserved or malformed slug', async () => {
    await service.resolve('user-1', 'chat').catch(() => undefined);
    await service.resolve('user-1', '../../etc').catch(() => undefined);

    expect(slugs.findBySlug).not.toHaveBeenCalled();
    expect(members.findByUser).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown slug', 'nobody-here'],
    ['another tenant’s current slug', 'theirs-rpi'],
    ['another tenant’s retired slug', 'theirs-old'],
    ['a deleted tenant’s slug', 'gone-rpi'],
    ['a malformed slug', '../../etc'],
    ['a reserved word', 'chat'],
  ])('answers %s with the one 404', async (_label, slug) => {
    const failure = await service.resolve('user-1', slug).catch((e) => e);

    expect(failure).toBeInstanceOf(NotFoundException);
    expect((failure as NotFoundException).getResponse()).toEqual({
      code: 'tenant.not_found',
      message: 'No chapter of yours has that address.',
    });
  });
});
