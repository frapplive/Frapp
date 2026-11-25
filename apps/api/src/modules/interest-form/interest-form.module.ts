import { Module } from '@nestjs/common';
import { InterestFormService } from '../../application/services/interest-form.service';
import {
  InterestFormController,
  PublicInterestFormController,
} from '../../interface/controllers/interest-form.controller';
import { SupabaseInterestFormRepository } from '../../infrastructure/supabase/repositories/supabase-interest-form.repository';
import { INTEREST_FORM_REPOSITORY } from '#domain/repositories/interest-form.repository.interface';
import { AuthModule } from '../auth/auth.module';
import { ChapterModule } from '../chapter/chapter.module';
import { EmailModule } from '../email/email.module';
import { NotificationModule } from '../notification/notification.module';
import { RbacModule } from '../rbac/rbac.module';

/**
 * A chapter's interest form (#5977): its settings on the Recruitment module
 * page, the public page's routes at `/f/<form-slug>`, and telling the
 * chapter. AuthModule → `USER_REPOSITORY`; ChapterModule → the chapter and
 * group repositories; EmailModule → the code, receipt and push-up emails;
 * NotificationModule → the push and inbox item; RbacModule → who holds
 * `rush:manage` and `rush:view`, and the guards.
 */
@Module({
  imports: [
    AuthModule,
    ChapterModule,
    EmailModule,
    NotificationModule,
    RbacModule,
  ],
  controllers: [InterestFormController, PublicInterestFormController],
  providers: [
    InterestFormService,
    {
      provide: INTEREST_FORM_REPOSITORY,
      useClass: SupabaseInterestFormRepository,
    },
  ],
  // The affiliation module pushes a chapter's form PNMs up when its council
  // link is accepted or a season opens.
  exports: [InterestFormService],
})
export class InterestFormModule {}
