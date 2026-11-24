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

@Module({
  // ChatModule → ChatService (posts the /rush card); AuthModule → USER_REPOSITORY
  // (resolves the adder's display name embedded in the card payload).
  imports: [RbacModule, ChatModule, AuthModule],
  controllers: [RushController, RushPipelineController],
  providers: [
    RushService,
    RushPipelineService,
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
