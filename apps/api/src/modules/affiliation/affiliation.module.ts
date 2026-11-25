import { Module } from '@nestjs/common';
import { AffiliationService } from '../../application/services/affiliation.service';
import { PnmService } from '../../application/services/pnm.service';
import { PnmRetentionWorkerService } from '../../application/workers/pnm-retention-worker.service';
import {
  ChapterAffiliationController,
  CouncilChaptersController,
} from '../../interface/controllers/affiliation.controller';
import {
  ChapterPnmController,
  CouncilRecruitmentController,
} from '../../interface/controllers/pnm.controller';
import { SupabaseAffiliationRepository } from '../../infrastructure/supabase/repositories/supabase-affiliation.repository';
import { SupabaseChapterRepository } from '../../infrastructure/supabase/repositories/supabase-chapter.repository';
import { SupabasePnmRepository } from '../../infrastructure/supabase/repositories/supabase-pnm.repository';
import { AFFILIATION_REPOSITORY } from '#domain/repositories/affiliation.repository.interface';
import { CHAPTER_REPOSITORY } from '#domain/repositories/chapter.repository.interface';
import { PNM_REPOSITORY } from '#domain/repositories/pnm.repository.interface';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
// `SCHOOL_REPOSITORY`: a chapter's school links name a school.
import { SchoolModule } from '../school/school.module';

/**
 * The school layer's third slice (#5974, `school-layer.md` § 2.4 and § 2.5):
 * a chapter's school and council links, a council's member chapters, PNM
 * records on the council's side and a chapter's, and the PNM retention
 * sweep.
 */
@Module({
  imports: [AuthModule, RbacModule, SchoolModule],
  controllers: [
    ChapterAffiliationController,
    CouncilChaptersController,
    CouncilRecruitmentController,
    ChapterPnmController,
  ],
  providers: [
    AffiliationService,
    PnmService,
    PnmRetentionWorkerService,
    {
      provide: AFFILIATION_REPOSITORY,
      useClass: SupabaseAffiliationRepository,
    },
    { provide: CHAPTER_REPOSITORY, useClass: SupabaseChapterRepository },
    { provide: PNM_REPOSITORY, useClass: SupabasePnmRepository },
  ],
})
export class AffiliationModule {}
