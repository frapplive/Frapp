import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  AiSuggestion,
  AiSuggestionDecision,
  AiSuggestionPayload,
} from '#domain/entities/ai-suggestion.entity';
import {
  AI_SUGGESTION_REPOSITORY,
  type IAiSuggestionRepository,
  type NewAiSuggestionChange,
} from '#domain/repositories/ai-suggestion.repository.interface';
import {
  MEMBER_REPOSITORY,
  type IMemberRepository,
} from '#domain/repositories/member.repository.interface';
import {
  compareSuggestion,
  changeFieldsAreCodes,
  type SuggestionChanges,
} from '#domain/utils/ai-suggestion-changes';
import {
  openAiText,
  sealAiText,
  type AiTextKeyRing,
} from '#domain/utils/ai-text-cipher';
import { aiStoredTextKeyRing } from '../../config/ai-stored-text-config';
import { reportCaughtFailure } from '../../infrastructure/observability/report-caught-failure';
import { AiConsentService } from './ai/ai-consent.service';
import type { AiSuggestionKindHandler } from './ai-suggestion-kinds';

/** How long a change log row is kept (Paul's pick, 2026-11-22). */
export const AI_SUGGESTION_CHANGE_KEEP_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
/** The member's question, at most, as sealed on a card. */
const REQUEST_MAX_LENGTH = 4000;

/** The context a card's sealed question is bound to (see `ai-text-cipher`). */
export function aiSuggestionRequestContext(
  chapterId: string,
  batchId: string,
): string {
  return `ai-suggestion-request:${chapterId}:${batchId}`;
}

/** The context a change log row's sealed words are bound to. */
export function aiSuggestionChangeContext(suggestionId: string): string {
  return `ai-suggestion-change:${suggestionId}`;
}

/** What a change log row's `words_sealed` opens to. */
export interface AiSuggestionChangeWords {
  /** The member's question, when Ask made the card. */
  request: string | null;
  proposed: Record<string, string | null>;
  /** Empty when nothing was saved (dismissed). */
  saved: Record<string, string | null>;
}

export interface AiSuggestionDecided {
  row: AiSuggestion;
  decision: Exclude<AiSuggestionDecision, 'expired'>;
  userId: string;
  handler: AiSuggestionKindHandler | undefined;
  /** The accepted payload, edits applied. Absent on a dismissal. */
  accepted?: AiSuggestionPayload;
  resultId?: string;
}

/**
 * The change log of AI suggestions (`ai_suggestion_changes`, Paul,
 * 2026-11-22: "we defo need to log what humans change when Frapp AI makes
 * suggestions"; `spec/behavior/ai.md` § Stored AI text).
 *
 * - **Changes always**: field by field whether what was saved kept, changed,
 *   added or removed what was proposed, as codes, ids and numbers.
 * - **Words only sealed**: the question, the proposed text and the saved
 *   text, sealed with `AI_STORED_TEXT_KEY`, and only when the decider has
 *   said yes to Frapp Intelligence. With no key, none are kept.
 * - **Never in the way**: a row that can't be written is reported and the
 *   decision stands.
 */
@Injectable()
export class AiSuggestionChangeLogService {
  private readonly logger = new Logger(AiSuggestionChangeLogService.name);

  /** The key ring, replaceable in tests. */
  keyRing: () => AiTextKeyRing | null = () => aiStoredTextKeyRing();

  constructor(
    @Inject(AI_SUGGESTION_REPOSITORY)
    private readonly repo: IAiSuggestionRepository,
    @Inject(MEMBER_REPOSITORY) private readonly members: IMemberRepository,
    private readonly consent: AiConsentService,
  ) {}

  /**
   * The member's question sealed for a waiting card, or null when there is
   * no key, no question, or sealing failed. Never throws.
   */
  sealRequest(
    chapterId: string,
    batchId: string,
    request: string | null | undefined,
  ): string | null {
    const text = request?.trim().slice(0, REQUEST_MAX_LENGTH);
    const ring = this.keyRing();
    if (!text || !ring) return null;
    try {
      return sealAiText(
        ring,
        text,
        aiSuggestionRequestContext(chapterId, batchId),
      );
    } catch {
      return null;
    }
  }

  /**
   * Compares a decided suggestion's proposal with what was saved. Returns
   * the changes (for the caller's analytics) or null when they couldn't be
   * worked out. Never throws.
   */
  async compare(input: AiSuggestionDecided): Promise<SuggestionChanges | null> {
    const log = input.handler?.changeLog;
    if (!log) return { fields: {}, changed: [], words: emptyWords() };
    try {
      const proposed = log.view(input.row.payload);
      if (input.decision !== 'accepted' || !input.accepted) {
        return compareSuggestion(log.fields, proposed, null);
      }
      const read =
        log.readSaved && input.resultId
          ? await log.readSaved({
              chapterId: input.row.chapter_id,
              payload: input.accepted,
              resultId: input.resultId,
            })
          : null;
      return compareSuggestion(
        log.fields,
        proposed,
        read ?? log.view(input.accepted),
      );
    } catch (error) {
      this.report('ai-suggestion-change-compare', input.row, error);
      return null;
    }
  }

  /**
   * Keeps one decided suggestion's change log row. Never throws: the
   * decision is made, and the log is not worth failing it.
   */
  async recordDecision(
    input: AiSuggestionDecided,
    changes: SuggestionChanges | null,
    now: Date,
  ): Promise<void> {
    const { row } = input;
    try {
      const [member, words] = await Promise.all([
        this.members.findByUserAndChapter(input.userId, row.chapter_id),
        changes ? this.sealWords(input, changes.words) : null,
      ]);
      const fields =
        changes && changeFieldsAreCodes(changes.fields) ? changes.fields : {};
      const log = input.handler?.changeLog;
      const madeInForm =
        input.decision === 'accepted' &&
        input.accepted !== undefined &&
        log?.madeInForm?.(input.accepted) === true;
      await this.repo.recordChanges([
        this.row(row, now, {
          decision: input.decision,
          decided_by: input.userId,
          member_id: member?.id ?? null,
          via:
            input.decision === 'accepted'
              ? madeInForm
                ? 'form'
                : 'card'
              : null,
          fields,
          words_sealed: words,
        }),
      ]);
    } catch (error) {
      this.report('ai-suggestion-change-record', row, error);
    }
  }

  /** Change log rows for suggestions the sweep expired. Never throws. */
  async recordExpired(
    rows: readonly Pick<
      AiSuggestion,
      'id' | 'chapter_id' | 'kind' | 'source_type' | 'requested_for' | 'ask_id'
    >[],
    now: Date,
  ): Promise<void> {
    if (rows.length === 0) return;
    try {
      await this.repo.recordChanges(
        rows.map((row) =>
          this.row(row, now, {
            decision: 'expired',
            decided_by: null,
            member_id: null,
            via: null,
            fields: {},
            words_sealed: null,
          }),
        ),
      );
    } catch (error) {
      reportCaughtFailure(this.logger, {
        level: 'warning',
        site: 'ai-suggestion-change-expired',
        message: `could not log ${rows.length} expired AI suggestions`,
        error,
      });
    }
  }

  /** Deletes change log rows past their 90 days. Returns how many. */
  async deleteExpired(now: Date): Promise<number> {
    return this.repo.deleteExpiredChanges(now.toISOString());
  }

  private row(
    row: Pick<
      AiSuggestion,
      'id' | 'chapter_id' | 'kind' | 'source_type' | 'requested_for' | 'ask_id'
    >,
    now: Date,
    decided: Pick<
      NewAiSuggestionChange,
      | 'decision'
      | 'decided_by'
      | 'member_id'
      | 'via'
      | 'fields'
      | 'words_sealed'
    >,
  ): NewAiSuggestionChange {
    return {
      suggestion_id: row.id,
      chapter_id: row.chapter_id,
      requested_for: row.requested_for,
      ask_id: row.ask_id ?? null,
      kind: row.kind,
      source_type: row.source_type,
      ...decided,
      decided_at: now.toISOString(),
      expires_at: new Date(
        now.getTime() + AI_SUGGESTION_CHANGE_KEEP_DAYS * DAY_MS,
      ).toISOString(),
    };
  }

  /**
   * The words sealed, or null: no key, the card drew on chat, the decider
   * hasn't said yes to Frapp Intelligence, there are none, or sealing failed (the row
   * is still kept, with the changes alone). Never throws.
   */
  private async sealWords(
    input: AiSuggestionDecided,
    words: SuggestionChanges['words'],
  ): Promise<string | null> {
    const ring = this.keyRing();
    if (!ring || drewOnChat(input.row)) return null;
    try {
      const state = await this.consent.getConsentState(input.userId);
      if (state.answer !== 'yes') return null;
      return this.seal(ring, input.row, words);
    } catch (error) {
      this.report('ai-suggestion-change-seal', input.row, error);
      return null;
    }
  }

  private seal(
    ring: AiTextKeyRing,
    row: AiSuggestion,
    words: SuggestionChanges['words'],
  ): string | null {
    const request = this.openRequest(ring, row);
    const record: AiSuggestionChangeWords = {
      request,
      proposed: words.proposed,
      saved: words.saved,
    };
    const hasAny =
      request !== null ||
      Object.values(words.proposed).some((value) => value !== null) ||
      Object.values(words.saved).some((value) => value !== null);
    if (!hasAny) return null;
    return sealAiText(
      ring,
      JSON.stringify(record),
      aiSuggestionChangeContext(row.id),
    );
  }

  private openRequest(ring: AiTextKeyRing, row: AiSuggestion): string | null {
    if (!row.request_sealed) return null;
    try {
      return openAiText(
        ring,
        row.request_sealed,
        aiSuggestionRequestContext(row.chapter_id, row.batch_id),
      );
    } catch {
      // Sealed with a key since dropped: the rest is still worth keeping.
      return null;
    }
  }

  private report(site: string, row: AiSuggestion, error: unknown): void {
    // The suggestion's id and kind only, never its words.
    reportCaughtFailure(this.logger, {
      level: 'warning',
      site,
      message: `AI suggestion ${row.id} (${row.kind}): change not logged`,
      error,
    });
  }
}

/**
 * Whether other members' chat may be in this card's words: the Ask turn read
 * channel messages before proposing it, or it was drawn from a channel.
 * Their authors never said yes to having their words kept, so none are
 * (as the beta diagnostics never keep an answer that drew on chat).
 */
function drewOnChat(row: AiSuggestion): boolean {
  return row.drew_on_chat === true || row.source_type === 'channel';
}

function emptyWords(): SuggestionChanges['words'] {
  return { proposed: {}, saved: {} };
}
