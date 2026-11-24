import { Module } from '@nestjs/common';
import { SchoolService } from '../../application/services/school.service';
import {
  SchoolController,
  SchoolPageController,
} from '../../interface/controllers/school.controller';
import { SchoolGuard } from '../../interface/guards/school.guard';
import { AuthSyncInterceptor } from '../../interface/interceptors/auth-sync.interceptor';
import { SupabaseSchoolRepository } from '../../infrastructure/supabase/repositories/supabase-school.repository';
import { SCHOOL_REPOSITORY } from '#domain/repositories/school.repository.interface';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';

/**
 * The school layer (school-layer.md § 2.1, § 2.2, #5929): school search,
 * school-email verification and `SchoolGuard`'s campus routes. Exports
 * `SchoolService` for chapter setup, whose Find step proposes a chapter's
 * school link.
 */
@Module({
  imports: [AuthModule, EmailModule],
  controllers: [SchoolController, SchoolPageController],
  providers: [
    AuthSyncInterceptor,
    SchoolGuard,
    SchoolService,
    { provide: SCHOOL_REPOSITORY, useClass: SupabaseSchoolRepository },
  ],
  // The repository too: starting a council checks the founder's school
  // membership (#5933, `CouncilService`).
  exports: [SchoolService, SCHOOL_REPOSITORY],
})
export class SchoolModule {}
