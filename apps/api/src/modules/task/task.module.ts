import { Module } from '@nestjs/common';
import { TaskService } from '../../application/services/task.service';
import { TaskSeriesService } from '../../application/services/task-series.service';
import { TaskController } from '../../interface/controllers/task.controller';
import { OpenTaskController } from '../../interface/controllers/open-task.controller';
import { OpenTaskService } from '../../application/services/open-task.service';
import { TaskAudienceService } from '../../application/services/task-audience.service';
import { OPEN_TASK_REPOSITORY } from '#domain/repositories/open-task.repository.interface';
import { SupabaseOpenTaskRepository } from '../../infrastructure/supabase/repositories/supabase-open-task.repository';
import { ChapterModule } from '../chapter/chapter.module';
import { FrappLinkCheckModule } from '../frapp-link/frapp-link-check.module';
import { SupabaseTaskRepository } from '../../infrastructure/supabase/repositories/supabase-task.repository';
import { TASK_REPOSITORY } from '#domain/repositories/task.repository.interface';
import { MEMBER_REPOSITORY } from '#domain/repositories/member.repository.interface';
import { SupabaseMemberRepository } from '../../infrastructure/supabase/repositories/supabase-member.repository';
import { RbacModule } from '../rbac/rbac.module';
import { NotificationModule } from '../notification/notification.module';
import { ChatModule } from '../chat/chat.module';
import { AuthModule } from '../auth/auth.module';
import { STORAGE_PROVIDER } from '#domain/adapters/storage.interface';
import { SupabaseStorageService } from '../../infrastructure/storage/supabase-storage.service';
import { AiModule } from '../ai/ai.module';
import { TaskExtensionService } from '../../application/services/task-extension/task-extension.service';
import { TaskExtensionReasonService } from '../../application/services/task-extension/task-extension-reason.service';
import { TASK_EXTENSION_REQUEST_REPOSITORY } from '#domain/repositories/task-extension-request.repository.interface';
import { SupabaseTaskExtensionRequestRepository } from '../../infrastructure/supabase/repositories/supabase-task-extension-request.repository';

@Module({
  // ChatModule → ChatService (posts the /task card); AuthModule → USER_REPOSITORY
  // (resolves assigner/assignee display names embedded in the card payload).
  // ChapterModule → ROLE_REPOSITORY and CHAPTER_GROUP_REPOSITORY: who a task
  // for a role or group reaches (TaskAudienceService, 2026-11-18).
  imports: [
    RbacModule,
    NotificationModule,
    ChatModule,
    AuthModule,
    ChapterModule,
    // A task's attachments must be the chapter's own records.
    FrappLinkCheckModule,
    // Judging a reason for more time (#6096).
    AiModule,
  ],
  controllers: [TaskController, OpenTaskController],
  providers: [
    TaskService,
    // "All upcoming tasks" edits and deletes of a repeating task (#5119).
    TaskSeriesService,
    // Who a task for a role, group or several people reaches, and tasks up
    // for grabs (2026-11-18).
    TaskAudienceService,
    OpenTaskService,
    // Asking for more time on a task (#6096).
    TaskExtensionService,
    TaskExtensionReasonService,
    {
      provide: TASK_EXTENSION_REQUEST_REPOSITORY,
      useClass: SupabaseTaskExtensionRequestRepository,
    },
    { provide: OPEN_TASK_REPOSITORY, useClass: SupabaseOpenTaskRepository },
    { provide: TASK_REPOSITORY, useClass: SupabaseTaskRepository },
    { provide: MEMBER_REPOSITORY, useClass: SupabaseMemberRepository },
    // Task photos (#4565).
    { provide: STORAGE_PROVIDER, useClass: SupabaseStorageService },
  ],
  // ActivityModule reads tasks through the service (#3897); the scheduled
  // jobs push each new repeating-task copy through it (#5119).
  // An accepted suggestion for "someone" posts a task up for grabs
  // (AiSuggestionModule). Ask's task card checks who a task may be from
  // (ActModule, 2026-11-22).
  // Activity's Needs you lists the waiting requests for more time (#6096).
  exports: [
    TaskService,
    OpenTaskService,
    TaskAudienceService,
    TaskExtensionService,
  ],
})
export class TaskModule {}
