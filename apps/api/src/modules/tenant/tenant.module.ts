import { Module } from '@nestjs/common';
import { TenantService } from '../../application/services/tenant.service';
import { TenantController } from '../../interface/controllers/tenant.controller';
import { AuthSyncInterceptor } from '../../interface/interceptors/auth-sync.interceptor';
import { SupabaseTenantSlugRepository } from '../../infrastructure/supabase/repositories/supabase-tenant-slug.repository';
import { SupabaseMemberRepository } from '../../infrastructure/supabase/repositories/supabase-member.repository';
import { SupabaseChapterRepository } from '../../infrastructure/supabase/repositories/supabase-chapter.repository';
import { TENANT_SLUG_REPOSITORY } from '#domain/repositories/tenant-slug.repository.interface';
import { MEMBER_REPOSITORY } from '#domain/repositories/member.repository.interface';
import { CHAPTER_REPOSITORY } from '#domain/repositories/chapter.repository.interface';
import { AuthModule } from '../auth/auth.module';

/** `GET /v1/tenants/resolve` (ADR-27 rollout step 1, #5918). */
@Module({
  imports: [AuthModule],
  controllers: [TenantController],
  providers: [
    AuthSyncInterceptor,
    TenantService,
    { provide: TENANT_SLUG_REPOSITORY, useClass: SupabaseTenantSlugRepository },
    { provide: MEMBER_REPOSITORY, useClass: SupabaseMemberRepository },
    { provide: CHAPTER_REPOSITORY, useClass: SupabaseChapterRepository },
  ],
})
export class TenantModule {}
