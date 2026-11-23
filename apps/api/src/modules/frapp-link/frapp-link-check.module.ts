import { Module } from '@nestjs/common';
import { FrappLinkChecker } from '../../application/services/frapp-link/frapp-link-checker.service';
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

/**
 * The write check for Frapp links (`FrappLinkChecker`), on repositories
 * alone, so the event and task modules both import it without importing each
 * other or the resolve route's services (`FrappLinkModule`).
 */
@Module({
  providers: [
    FrappLinkChecker,
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
  exports: [FrappLinkChecker],
})
export class FrappLinkCheckModule {}
