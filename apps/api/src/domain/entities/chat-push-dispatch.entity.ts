/**
 * The push worker's per-message claim, persisted to `chat_push_dispatches`
 * (`20260930020000_chat_push_dispatches.sql`, #2846).
 *
 * One row per `chat_messages` row the worker fans out. The primary key is the
 * dedup mechanism: every API instance receives every Realtime INSERT, and only
 * the one whose insert wins sends the pushes. A losing insert raises `23505`
 * and means "another instance owns this message", not an error.
 *
 * API-only (service role). Rows older than a day are purged hourly.
 */
export interface ChatPushDispatch {
  message_id: string;
  dispatched_at: string;
}

/**
 * The one row of `api_wake` (`20261127184653_api_wake_chat_push_catch_up.sql`,
 * #6123): the API's public origin, which the API writes at boot, and when the
 * database last poked it. `wake_api()` reads it to wake a sleeping staging
 * API when a chat message arrives.
 *
 * API-only (service role).
 */
export interface ApiWake {
  id: boolean;
  url: string | null;
  poked_at: string | null;
  updated_at: string;
}
