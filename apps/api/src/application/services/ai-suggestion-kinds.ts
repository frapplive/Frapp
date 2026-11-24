import type {
  ChangeFieldSpec,
  ChangeView,
} from '#domain/utils/ai-suggestion-changes';
import type {
  AiSuggestionKind,
  AiSuggestionPayload,
  AiSuggestionSourceType,
} from '#domain/entities/ai-suggestion.entity';

/**
 * One handler per suggestion kind (#4309). The suggestion service owns the
 * shared rules (permission re-check, source access, one push per batch,
 * expiry, no stored text once decided); a handler owns only what differs by
 * kind: what a valid proposal looks like, what an officer may change, and how
 * accepting commits through the ordinary service.
 *
 * A new kind (a decision to log, a form field value, an agent's action) is a
 * new handler added to {@link AI_SUGGESTION_KIND_HANDLERS} and to the
 * `ai_suggestions.kind` check, never a new table or a new accept path.
 */
export const AI_SUGGESTION_KIND_HANDLERS = 'AI_SUGGESTION_KIND_HANDLERS';

export interface AiSuggestionCommitResult {
  /** The id of what was made (the first one, when it made several). */
  resultId: string;
  /**
   * Counts the accepter is told, when accepting made more than one change:
   * how many were made and how many were left out. Numbers only, never text.
   */
  outcome?: Readonly<Record<string, number>>;
}

/**
 * How a kind's change log compares what was proposed with what was saved
 * (`ai_suggestion_changes`, Paul 2026-11-22). Absent, a decision is logged
 * with no fields.
 */
export interface AiSuggestionChangeLog {
  /** The fields compared, and how (`compareSuggestion`). */
  readonly fields: ChangeFieldSpec;
  /** A payload as those fields. */
  view(payload: AiSuggestionPayload): ChangeView;
  /**
   * Whether the accept only names what the member made in the full form the
   * card's Edit opened (`via: form`).
   */
  madeInForm?(payload: AiSuggestionPayload): boolean;
  /**
   * What was actually saved, read back, when the accept's payload only names
   * it (an event made in its form). Null: compare the accepted payload.
   */
  readSaved?(input: {
    chapterId: string;
    payload: AiSuggestionPayload;
    resultId: string;
  }): Promise<ChangeView | null>;
}

export interface AiSuggestionKindHandler {
  /** How what people change is logged; see {@link AiSuggestionChangeLog}. */
  readonly changeLog?: AiSuggestionChangeLog;
  readonly kind: AiSuggestionKind;
  /** What the accepter must hold at the moment they accept. */
  readonly requiredPermission: string;
  /**
   * The chapter module what it makes belongs to. A suggestion of a kind whose
   * module is off is not listed and can't be accepted.
   */
  readonly module: string | null;
  /** How long it waits before it expires. */
  readonly expiresAfterDays: number;
  /** The notification category its batch push is sent under. */
  readonly pushCategory: string;
  /** "3 suggested tasks to review": the body of a batch's push. */
  describeBatch(count: number): string;
  /**
   * Cleans what the AI proposed into the stored payload, or null when it
   * can't be used (it is then dropped, not stored). `context.sourceType` is
   * the suggestion source's type (`request` is the officer's own request to
   * Frapp Intelligence), for a kind that trusts some fields only from it.
   */
  normalizeProposal(
    raw: unknown,
    context?: { sourceType?: string },
  ): AiSuggestionPayload | null;
  /** The payload with an officer's edits applied. Throws a 400 on a bad edit. */
  applyEdits(
    payload: AiSuggestionPayload,
    edits: Record<string, unknown>,
  ): AiSuggestionPayload;
  /**
   * Whether an accept changed what was proposed, for the `edited` figure.
   * Absent, any difference in the payload counts.
   */
  countsAsEdited?(
    proposed: AiSuggestionPayload,
    accepted: AiSuggestionPayload,
  ): boolean;
  /**
   * Throws a 400 naming what is missing when the payload can't be accepted
   * as it stands (a task with no owner yet). Checked before the claim, so a
   * refusal changes nothing.
   */
  assertAcceptable(payload: AiSuggestionPayload): void;
  /**
   * Makes the change through the ordinary service, as `userId`. Never posts a
   * chat message.
   */
  commit(input: {
    chapterId: string;
    userId: string;
    /**
     * The suggestion being accepted. A kind that makes several changes (a
     * points change for many members) derives each one's idempotency key
     * from it, so an accept that is retried never grants twice.
     */
    suggestionId: string;
    payload: AiSuggestionPayload;
    source: { type: AiSuggestionSourceType; id: string };
  }): Promise<AiSuggestionCommitResult>;
}
