import { aiSuggestionChangeContext } from './application/services/ai-suggestion-change-log.service';
import { openSealedRows } from './open-sealed-rows';

/**
 * Opens the words of the AI suggestion change log (Paul, 2026-11-22): rows
 * of `ai_suggestion_changes` selected as `suggestion_id as id, chapter_id,
 * words_sealed as sealed`. Each is sealed to its own suggestion, so a row
 * without its id can't be opened. The reader and its rules:
 * `open-sealed-rows.ts`; the query: `docs/ops/ai-suggestion-changes.md`.
 */
openSealedRows((_chapterId, id) => aiSuggestionChangeContext(id ?? ''));
