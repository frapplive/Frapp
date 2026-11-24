import { Module } from '@nestjs/common';
import { RushService } from '../../application/services/rush.service';
import { RushController } from '../../interface/controllers/rush.controller';
import { RushPipelineController } from '../../interface/controllers/rush-pipeline.controller';
import { RushPipelineService } from '../../application/services/rush-pipeline.service';
import { SupabaseRushPipelineRepository } from '../../infrastructure/supabase/repositories/supabase-rush-pipeline.repository';
import { RUSH_PIPELINE_REPOSITORY } from '#domain/repositories/rush-pipeline.repository.interface';
import { SupabaseRushCandidateRepository } from '../../infrastructure/supabase/repositories/supabase-rush-candidate.repository';
import { RUSH_CANDIDATE_REPOSITORY } from '#domain/repositories/rush-candidate.repository.interface';
import { ChatModule } from '../chat/chat.module';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { ChapterModule } from '../chapter/chapter.module';
import { ChannelAccessModule } from '../channel-access/channel-access.module';
import { RushSettingsService } from '../../application/services/rush-settings.service';
import { RushBidService } from '../../application/services/rush-bid.service';
import { RushBidController } from '../../interface/controllers/rush-bid.controller';
import { RushBidConfirmationController } from '../../interface/controllers/rush-bid-confirmation.controller';
import { SupabaseRushBidRepository } from '../../infrastructure/supabase/repositories/supabase-rush-bid.repository';
import { RUSH_BID_REPOSITORY } from '#domain/repositories/rush-bid.repository.interface';
import { InviteModule } from '../invite/invite.module';
import { EmailModule } from '../email/email.module';
import { SupabaseChatChannelRepository } from '../../infrastructure/supabase/repositories/supabase-chat-channel.repository';
import { CHAT_CHANNEL_REPOSITORY } from '#domain/repositories/chat.repository.interface';

@Module({
  // ChatModule → ChatService (posts the /rush card); AuthModule → USER_REPOSITORY
  // (resolves the adder's display name embedded in the card payload).
  // ChapterModule → the role, tier and group repositories, and
  // ChannelAccessModule → who can read a channel, for the Recruitment
  // settings' new-member role, contacts Group and card channel (#5973).
  imports: [
    RbacModule,
    ChatModule,
    AuthModule,
    ChapterModule,
    ChannelAccessModule,
    // InviteModule → the accepted PNM's invite; EmailModule → the one-tap
    // confirmation email (#5973).
    InviteModule,
    EmailModule,
  ],
  controllers: [
    RushController,
    RushPipelineController,
    RushBidController,
    RushBidConfirmationController,
  ],
  providers: [
    RushService,
    RushPipelineService,
    RushSettingsService,
    RushBidService,
    { provide: RUSH_BID_REPOSITORY, useClass: SupabaseRushBidRepository },
    {
      provide: CHAT_CHANNEL_REPOSITORY,
      useClass: SupabaseChatChannelRepository,
    },
    {
      provide: RUSH_PIPELINE_REPOSITORY,
      useClass: SupabaseRushPipelineRepository,
    },
    {
      provide: RUSH_CANDIDATE_REPOSITORY,
      useClass: SupabaseRushCandidateRepository,
    },
  ],
})
export class RushModule {}
