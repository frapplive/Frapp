import { Module } from '@nestjs/common';
import { ChatTimeoutService } from '../../application/services/chat-timeout.service';
import { ChatTimeoutSweepService } from '../../application/workers/chat-timeout-sweep.service';
import { ChatTimeoutController } from '../../interface/controllers/chat-timeout.controller';
import { USER_REPOSITORY } from '#domain/repositories/user.repository.interface';
import { SupabaseUserRepository } from '../../infrastructure/supabase/repositories/supabase-user.repository';
// ChapterModule → MEMBER_REPOSITORY.
import { ChapterModule } from '../chapter/chapter.module';
// ChapterConfigModule → ChapterAuditLogService, which records each timeout.
import { ChapterConfigModule } from '../chapter-config/chapter-config.module';
// RbacModule → the rank context and PermissionsGuard's role lookups.
import { RbacModule } from '../rbac/rbac.module';
// NotificationModule → the push when a timeout starts, is lifted or ends.
import { NotificationModule } from '../notification/notification.module';

/**
 * Chat timeouts (#6006): the routes that set and lift one, the caller's own
 * read, and the sweep that tells a member theirs is over. Enforcement lives
 * in `ChannelAccessService`, which reads the member row it already fetches.
 */
@Module({
  imports: [ChapterModule, ChapterConfigModule, RbacModule, NotificationModule],
  controllers: [ChatTimeoutController],
  providers: [
    ChatTimeoutService,
    ChatTimeoutSweepService,
    { provide: USER_REPOSITORY, useClass: SupabaseUserRepository },
  ],
})
export class ChatTimeoutModule {}
