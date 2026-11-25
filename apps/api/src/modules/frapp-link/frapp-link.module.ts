import { Module } from '@nestjs/common';
import { FrappLinkService } from '../../application/services/frapp-link/frapp-link.service';
import { FrappLinkController } from '../../interface/controllers/frapp-link.controller';
import { CHAPTER_DOCUMENT_REPOSITORY } from '#domain/repositories/chapter-document.repository.interface';
import { MEETING_REPOSITORY } from '#domain/repositories/meeting.repository.interface';
import { EVENT_REPOSITORY } from '#domain/repositories/event.repository.interface';
import {
  CHAT_CHANNEL_REPOSITORY,
  CHAT_MESSAGE_REPOSITORY,
} from '#domain/repositories/chat.repository.interface';
import { SupabaseChapterDocumentRepository } from '../../infrastructure/supabase/repositories/supabase-chapter-document.repository';
import { SupabaseMeetingRepository } from '../../infrastructure/supabase/repositories/supabase-meeting.repository';
import { SupabaseEventRepository } from '../../infrastructure/supabase/repositories/supabase-event.repository';
import { SupabaseChatChannelRepository } from '../../infrastructure/supabase/repositories/supabase-chat-channel.repository';
import { SupabaseChatMessageRepository } from '../../infrastructure/supabase/repositories/supabase-chat-message.repository';
import { ChapterDocumentModule } from '../chapter-document/chapter-document.module';
import { MeetingModule } from '../meeting/meeting.module';
import { EventModule } from '../event/event.module';
import { ChannelAccessModule } from '../channel-access/channel-access.module';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';

/**
 * `POST /v1/frapp-links/resolve` (`spec/behavior/frapp-links.md`): what each
 * Frapp link names for the member asking, read through each record's own
 * feature (Documents, minutes, events, channel access).
 */
@Module({
  imports: [
    ChapterDocumentModule,
    MeetingModule,
    EventModule,
    ChannelAccessModule,
    AuthModule,
    RbacModule,
  ],
  controllers: [FrappLinkController],
  providers: [
    FrappLinkService,
    {
      provide: CHAPTER_DOCUMENT_REPOSITORY,
      useClass: SupabaseChapterDocumentRepository,
    },
    { provide: MEETING_REPOSITORY, useClass: SupabaseMeetingRepository },
    { provide: EVENT_REPOSITORY, useClass: SupabaseEventRepository },
    {
      provide: CHAT_CHANNEL_REPOSITORY,
      useClass: SupabaseChatChannelRepository,
    },
    {
      provide: CHAT_MESSAGE_REPOSITORY,
      useClass: SupabaseChatMessageRepository,
    },
  ],
})
export class FrappLinkModule {}
