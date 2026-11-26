import { Injectable, Logger } from '@nestjs/common';
import { LanguageModelError } from '#domain/adapters/language-model.interface';
import type { TaskExtensionAiVerdict } from '#domain/entities/task-extension-request.entity';
import { AiGatewayService } from '../ai/ai-gateway.service';
import {
  TASK_EXTENSION_NOTE_MAX,
  TASK_EXTENSION_REASON_PROMPT_VERSION,
  TASK_EXTENSION_REASON_SYSTEM,
  TaskExtensionReasonOutputSchema,
  taskExtensionReasonMessages,
} from './task-extension-reason-prompt';

/** What the classifier made of a reason, or that it couldn't say. */
export type ExtensionReasonVerdict =
  | { verdict: TaskExtensionAiVerdict; note: string }
  | { verdict: null };

/**
 * Judges a member's reason for more time (#6096, `spec/behavior/tasks.md`
 * § Asking for more time) through `tasks.extension-reason`.
 *
 * **It never refuses anyone.** Every way the call can't answer (the server
 * without AI, the chapter's switch off, the member's No, a spend cap, a
 * provider failure or refusal, a reply that isn't the schema) is
 * `{ verdict: null }`, and the request goes to an officer. Only a valid
 * verdict approves anything, and only the one day the service already
 * checked.
 *
 * Only the title and the reason are sent. Nothing is logged but the
 * failure's kind; the gateway's ledger and usage event carry sizes and the
 * prompt version only.
 */
@Injectable()
export class TaskExtensionReasonService {
  private readonly logger = new Logger(TaskExtensionReasonService.name);

  constructor(private readonly gateway: AiGatewayService) {}

  async judge(input: {
    chapterId: string;
    userId: string;
    title: string;
    reason: string;
  }): Promise<ExtensionReasonVerdict> {
    let result;
    try {
      result = await this.gateway.generateObject(
        'tasks.extension-reason',
        {
          promptVersion: TASK_EXTENSION_REASON_PROMPT_VERSION,
          system: TASK_EXTENSION_REASON_SYSTEM,
          messages: taskExtensionReasonMessages(input.title, input.reason),
          schema: TaskExtensionReasonOutputSchema,
        },
        { chapterId: input.chapterId, actingUserId: input.userId },
      );
    } catch (error) {
      if (!(error instanceof LanguageModelError)) {
        // Not the provider: still an officer's call, never a failed ask.
        this.logger.warn('Extension reason check failed: unexpected error');
        return { verdict: null };
      }
      // Its kind only: a `LanguageModelError` carries no provider text.
      this.logger.warn(`Extension reason check failed: ${error.kind}`);
      return { verdict: null };
    }
    if (result.status !== 'ok') return { verdict: null };
    const note = result.value.note.trim().slice(0, TASK_EXTENSION_NOTE_MAX);
    return { verdict: result.value.verdict, note };
  }
}
