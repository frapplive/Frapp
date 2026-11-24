# Points Ledger — Security, Audit, and Atomicity

## Core Invariant

Every point change is a row in `point_transactions`. There is no mutable "balance" column. A member's balance is always computed as `SUM(amount) WHERE user_id = ? AND chapter_id = ?`.

## Atomic Point Awarding

When a user checks into an event:

1. Validate the event exists and belongs to the chapter.
2. Validate the user has not already checked in (unique constraint on event_id + user_id).
3. In a single database transaction:
   a. Insert `event_attendance` with status PRESENT.
   b. Insert `point_transactions` with amount = event.point_value, category = ATTENDANCE.
4. If either insert fails, the entire transaction rolls back.

**This invariant governs every path that auto-awards points**, not just event check-in: the state change that earns the points and the `point_transactions` insert always commit or roll back together, in one transaction. Where a row carries a `points_awarded` flag (task confirmation → MANUAL, service-hour approval → SERVICE), the transaction is a **compare-and-set**: it updates the row only while it is still eligible (`points_awarded = false`), so concurrent or retried awards can't double-insert — exactly one caller wins and the rest are no-ops. Where the award is instead a fresh insert with no such flag (event check-in awards ATTENDANCE), the same guarantee comes from a unique constraint: the `check_in_event` RPC inserts the `event_attendance` row with `on conflict (event_id, user_id) do nothing` and awards points only when that insert wins, so concurrent or retried check-ins can't double-insert either. A guard read in the service layer is only a friendly fast path; the conditional write is the authoritative concurrency guard.

## Admin Adjustments

- Only users with the `points:adjust` permission can manually add or remove points.
- Every manual adjustment requires a **reason** field (non-empty string). This is displayed in the transaction log alongside the adjustment.
- All admin point changes record the admin's user ID as `adjusted_by` in the transaction metadata. This creates an irrefutable audit trail.
- Categories for manual adjustments: MANUAL (reward) or FINE (penalty).
- **The target must be a member of the chapter** ([#3092](https://github.com/pdcarlson/Frapp/issues/3092)). `POST /v1/points/adjust` refuses any other `target_user_id` with `404 Member not found` before it checks for a replay, counts the rate limit, writes the row or notifies anyone. Every guard on the route checks the caller and the ledger's foreign keys accept any user, so without this an officer could fine, and push a reason to, someone in another chapter. A user in another chapter, a member who has left and an id that names nobody all get the same 404, so the answer reveals nothing about other chapters. An alumnus still has a `members` row, so they stay adjustable: the alumni rule restricts what they earn themselves ([`alumni.md` § Enforcement](alumni.md#enforcement)), and an append-only ledger has to let a wrong grant on someone who just graduated be corrected.

## Anti-Fraud

- **Append-only:** All transactions are immutable. No edits, no deletes. Corrections are new transactions with the inverse amount and a description referencing the original.
- **Rate limiting:** A single admin cannot create more than N point adjustments per hour **in a given chapter**. The counter is scoped to the `(admin, chapter)` pair — `countRecentAdjustments(adminUserId, chapterId, since)` filters on both — so the limit bounds one admin in one chapter, not the chapter as a whole. Exceeding it returns 429 Too Many Requests. N is `chapter_points_config.adjustment_rate_limit_per_hour`, **default 50**. This section is the canonical statement of the limit and its scoping; other docs link here rather than restating it.
- **Anomaly flagging:** If a single transaction's absolute amount reaches a configured threshold, it is automatically flagged for review. Flagged transactions are what the chapter points ledger's **Flagged only** filter shows ([§ Where points are read](#where-points-are-read)), and the ledger states the two active limits so an officer reading a flag knows what produced it. The threshold is `chapter_points_config.anomaly_threshold`, **default 100** (so ±100 flags).
- **A flag is historical, not a live predicate.** `metadata.flagged` is written into the ledger row at adjustment time and the ledger's Flagged only filter reads the stored flag, so raising or lowering the threshold **never re-evaluates existing rows**. After a chapter moves the dial its ledger legitimately holds rows flagged under the old threshold and unflagged rows above the new one. This is the append-only rule doing its job — a flag records what the chapter's policy was when the adjustment was made — but it only became observable once the threshold could move, so the ledger says so.
- **Both limits above are chapter-configurable**, held in the `chapter_points_config` singleton row (PK `chapter_id`) and read on each `POST /v1/points/adjust`. They are set through `PATCH /v1/chapters/:id/config` under the `points` key, which audits the change like any other config write. **That route is gated on `chapter-config:manage` (or `*`)** — in a chapter created before #4071's second PR no seeded role but President's wildcard holds it; newer chapters give it to the whole Exec board tier ([`rbac.md`](rbac.md#role-lifecycle)), and a `roles:manage` holder can grant it to any role ranked below them only if they hold it themselves. Note what that means: a chapter that delegates config-manage for branding or dues also delegates the ability to loosen these two fraud controls. Every such change lands in `chapter_audit_log`, which officers read on the Logs page in Chapter settings ([`settings/README.md` § Audit Rules](settings/README.md#audit-rules)), so it is recorded rather than silent, and both dials are bounded at the API (rate ≤ 1000/hr, threshold ≤ the ledger's own ±100,000 ceiling) so neither can be switched off outright. Whether tuning an anti-fraud limit deserves its own permission rather than riding the general config grant is [#1582](https://github.com/pdcarlson/Frapp/issues/1582). Each is floored at **1** by both the DTO and a column `CHECK`, for two different reasons: a rate limit of `0` would refuse every adjustment with no way back out through the API (the ledger is append-only, so there is no corrective write either), and a threshold of `0` would flag every row and make the ledger's Flagged only filter meaningless. A chapter that wants no manual adjustments at all removes the `points:adjust` permission — that is the control for it. **A chapter with no row is not misconfigured:** the absent row means "use the defaults", which are exactly the values the service hardcoded before [#394](https://github.com/pdcarlson/Frapp/issues/394), so no chapter's behaviour changed when the limits became configurable and nothing provisions rows at onboarding.
- **Hard amount ceiling:** a single ledger write must fall within **±100,000 points**. This is a validation bound, not a flag — the request is rejected with 400 and no ledger row is written. Flagging above (which only marks a committed row for review) is the response to a *large* adjustment; this is the response to an implausible one. A legitimate correction larger than the ceiling is made as several adjustments, each with its own reason and audit row.
  - The ceiling applies to **every** award path, not just manual adjustment — attendance, tasks, study, and service accrual all write the same ledger, and several are reachable with a broader grant than `points:adjust` (submitting a service entry needs only `service:log`, which the default Member role holds). Since the ledger is append-only and the correcting adjustment is itself bound by this ceiling, an uncapped write would not be fully reversible through the API. Each path is bound at its **request field**; the enforced list lives in `apps/api/src/interface/dtos/dto-constraint-coverage.spec.ts` rather than here, because an enumeration written in prose goes stale without failing anything.
  - **Study awards are bounded at their input, not yet at their total.** A study award is `intervals × points_per_interval`, and the interval count comes from measured session length rather than the request, so a long enough session can still produce a row above the ceiling even with the rate capped. Whether a marathon session should be clamped, refused, or given a category-specific ceiling is an open product decision — [#948](https://github.com/pdcarlson/Frapp/issues/948). Service accrual is not affected: its award is `floor(duration_minutes / minutes_per_point)`, so capping the submitted duration bounds the row.
- **Idempotency:** `POST /v1/points/adjust` accepts a client-minted UUIDv4 `client_message_id`, and a replay carrying a key this chapter has already used **returns the original transaction instead of writing a second row**. This exists because the append-only rule above has a sharp edge: a lost response is indistinguishable from a lost write, and a retry that double-granted could not be undone — only offset by a further adjustment. The key is the dedupe key for the ledger row *and* the chat card, enforced by the partial unique index `idx_point_transactions_dedupe` on `(chapter_id, client_message_id)`. What follows:
  - A replay is resolved **before** the adjustments/hour check, so an officer at the ceiling whose grant already committed is never told 429 for it. (The limit itself is counted from committed rows, so a replay could not consume a slot in any case — the ordering is about the honest answer, not the accounting.)
  - **A replay never re-sends the member's push notification.** That side effect is not idempotent. **The chat card is re-attempted only into the origin channel stored on the ledger row.** `idx_chat_messages_dedupe` is scoped `(channel_id, sender_id, client_message_id)` rather than by key alone, so posting into a *different* channel would not collide with the original card and would re-broadcast a `FINE`. The origin is a nullable `channel_id` written alongside `client_message_id`. A replay that names a different `channel_id` is refused with 409, matching the other mismatched-field rule below. A row with no stored origin (dashboard adjustments, and chat adjustments committed before the column existed) still fires no card — those cannot be healed. `ChatService.sendMessage` is itself idempotent on the same triple, so a replay into the stored channel is a no-op when the original post already landed and a heal when it did not. The route reports that attempt as `card_posted`.
  - **Dashboard adjustments carry a key too** ([#1906](https://github.com/pdcarlson/Frapp/issues/1906), the half [#1733](https://github.com/pdcarlson/Frapp/issues/1733) left out). `useAdjustPoints` binds one `client_message_id` to the exact adjustment the treasurer submits. Its automatic retries reuse it, and so does submitting the same adjustment again from the still-open form after a failure, so a lost response heals into the original row instead of writing a second one. Reopening the dialog starts a new adjustment under a fresh key, as re-typing `/points` does, except while the last adjustment is still in flight: the reopened dialog then stays on it rather than letting a second request run beside its retries. A success releases the key, so a second deliberate grant of the same amount is a second legitimate row; a changed adjustment gets a fresh key too. A definitive refusal releases it as well, unless an earlier attempt under that key may have committed: a refusal that runs before the replay check (the throttler's `429`, a `401` or `403`, or the non-member target's `404`) says nothing about that attempt, so the key is kept, while a `409` always releases it. It retries automatically only a failure that may have committed (a 5xx, a dropped connection, or `408`/`499`/`460`; an empty error body is judged by its status like any other), at most twice, and never once the active chapter has changed since the submit. The dashboard sends no `channel_id`, so its rows have no stored origin and a replay posts no card. Rows the dashboard wrote before it sent a key have none and are not deduplicated.
  - **A key reused for a *different* adjustment is refused with 409, never answered with the stored row.** The index is scoped by chapter alone — the ledger has no sender column — so a key is chapter-wide, and the id is client-supplied and validated only as a UUID. Returning the stored row on a mismatch would answer "granted" while writing nothing and discarding the adjustment actually requested, potentially handing the caller another member's transaction. The server therefore compares target, amount, category, reason, acting admin, **and origin channel** (when the stored row has one) before treating a request as a replay.
  - **`/points` reuses its key on an explicit retry.** A slash dispatch whose response is lost — a 5xx, a transport failure, a refused replay, or one of the 4xx statuses an intermediary emits after the origin may already have committed (`408`/`499`/`460`) — no longer tears its placeholder down and reports failure. The row stays in the timeline as `unconfirmed`, holding the original `client_message_id`, and its **Retry** control replays that same request — so the replay meets the index above and returns the original transaction instead of writing a second row. Re-typing the command remains a *new* adjustment and mints a fresh key, which is correct: two deliberate grants of the same amount to the same member are two legitimate rows. The row and its retry handle are persisted on the dispatching browser, so the reconnect that follows the outage, a reload, and a 10-minute eviction can restore them; when they do, and what keeps and evicts them, is stated once, in [`chat/integrations.md` § Slash command dispatch](chat/integrations.md#slash-command-dispatch) ([#1909](https://github.com/pdcarlson/Frapp/issues/1909)). What is left is outside what a client can close: the row lives in that browser's storage, so another device, or a browser that blocks storage, never sees it.
- **Adjustment reasons are capped at 500 characters.** The reason is not only stored: it is interpolated into the points chat card posted to the channel, so an uncapped reason would write a chat message far larger than the chat send path itself permits.
- **No self-award:** An admin must not be able to move their own balance without a second party. Like the ceiling above, this binds the **ledger**, not one endpoint: every path where the same member both earns and authorises an award is required to refuse it. Enforcement is per-path, and every award path that has an approver now refuses it — the sub-bullets record each one.
  - `points:adjust` rejects requests where the target user matches the requesting user.
  - **Task confirmation** rejects a confirm whose task is assigned to the confirming member ([`tasks.md`](tasks.md) § Admin Confirmation). Confirming awards `point_reward` to the assignee, so without this a `tasks:manage` holder could assign themselves a task, mark it COMPLETED, and confirm it alone.
  - Event check-in and study accrual sit outside this rule: they award the acting member against measured state rather than an authorisation, so there is no approver to be a second party. Note this is a statement about shape, not a guarantee of strength — study points derive from measured session minutes, but check-in is measured only when the event defines a `check_in_zone` or an officer's QR screen has reported a location (the code is required, and the member must be within 100 yards of the screen, [`events.md`](events.md) § Check-In). An event with neither is bounded by its `point_value` and its time window rather than by measurement.
  - **Service-hour approval** rejects an approval whose entry was submitted by the approving member ([`service-hours.md`](service-hours.md) § Approval Workflow). Approving awards SERVICE points to the submitter, so without this a member holding `service:log` **and** `service:approve` — a bundle an officer routinely holds, and a service chair holds by definition — could log their own hours and approve them alone. The refusal does not depend on the chapter's `minutes_per_point` rate: a sub-rate entry that would approve with no ledger row is refused just the same, so who may authorise an award never changes when a settings dial moves.

## Leaderboard

- Chapter-scoped. Shows rank, member name, and total points.
- **Names are resolved client-side against the chapter roster**, not joined onto
  the leaderboard response: `GET /v1/points/leaderboard` aggregates
  `point_transactions` and returns `{ user_id, total }` only.
- **Zero is a standing.** The board lists every current member who isn't an
  alumnus, at `0` when they have no transaction in the window, so a new
  chapter's board is its whole roster tied for first rather than nothing.
  `PointsService.getLeaderboard` adds those rows to what
  `get_points_leaderboard` returns (the roster from `members`, alumni resolved
  by the Alumni role's `system_key`), in the same order: total descending, then
  `user_id`. Alumni are left out unless points put them on the board, since
  they can't earn points themselves ([`alumni.md`](alumni.md)). An
  **archived semester** is not padded: today's roster says nothing about who
  was in the chapter then, so that board is only the members whose points moved
  in it (2026-11-06).
- **The board is drawn as the Directory's standings** ([§ Standings](#standings)),
  so each row is a member row of the Directory and draws only for someone on
  the list in view. A board row with no Directory row (a member who has left
  the chapter, see *Edge Cases*, or an alumnus with points while Actives is in
  view) keeps its place but isn't drawn, so the places on screen can skip a
  number. *(Corrected 2026-11-24, #5950: until then the board was the Points
  page's own list, which drew such a row with the shared `Member <first six
  hex>` label and could be filtered by a pasted user id.)*
- The **chapter points ledger** is the exception and keeps the full `user_id`
  on an unresolved row: it is a record officers read ids out of, not a name
  slot.
- Rank is the member's position on the **whole** board for the selected window.
  Filtering the view never renumbers it.
  **Equal totals share a rank** (1, 1, 3), in the Directory's standings and on
  the mobile task board's points line alike, so a roster tied at 0 is everyone
  at `#1` (2026-11-06).
  *Changed in #5950 by pdcarlson, 2026-11-24:* in the Directory's standings a
  member with nothing in the period (a total of 0 or less) gets no place: their
  row lists after the ranked ones, unnumbered, and a member's own points show
  no "#24 of 24" either. A place tied for last says nothing a member can act on.
- The sum happens **in Postgres** (`get_points_leaderboard`), not in the API
  process. Rows come back by total descending, **ties broken by `user_id`** — so
  two members on the same total hold the same relative order on every request,
  rather than depending on which of them most recently earned points.
- Configurable time window: all-time, this semester, this month, or one
  specific archived semester by id (`semester_archive_id`, resolved against
  that archive's own `[start_date, end_date]` calendar-day range) — the
  archive selection overrides the enum window entirely. `GET /v1/points/me`,
  `GET /v1/points/leaderboard`, `GET /v1/points/members/:userId`, and
  `POST /v1/reports/points` all accept it; the archived semesters are
  periods (backed by `useSemesters()`) in the points standing and in a
  member's own points ([§ Standings](#standings),
  [§ Where points are read](#where-points-are-read)). Which clients expose it
  is tracked in
  [Semester Rollover § Historical Data](semester-rollover.md#historical-data).
- Visible to all members.
- Admins see the full transaction ledger for all members. Members see only their own transactions plus the leaderboard rankings.

## Standings

The leaderboard has no page of its own on either app (#5950, Paul's pick, 2026-11-24, on epic #5943: standing is a fact about a person, shown on the person).
It is drawn as a **sort of the Directory's member list**, and so is the service hours board ([`service-hours.md` § Visibility](service-hours.md#visibility)): one model for both apps and both measures (`useStandings` and `rankStandings` in `@repo/hooks` `standings.ts`).
Which sorts each app offers and how a row draws are [`members.md` § Directory](members.md#directory)'s.

- **A standing counts over a period**, picked beside the sort: This semester (the default), This month or All time, and for points each archived semester after them.
  The service board takes a date range and has no archive, so it offers the three live periods only; its This semester starts the day after the latest archive ends, as the Activity standing's does ([`activity.md` § Standing](activity.md#standing)).
  This month is the rolling month for both measures, from the same day one calendar month back, as every points "This month" is (`resolveWindowSince('month')`), so one label never means two periods in the same sort.
- **Each row leads with the member's place** and ends with their total for the period ("45 points", "2.5 hours").
  Places are ranked as above: equal totals share a place, and a search or filter never renumbers them. A member with nothing in the period (0 or less) has no place; their row comes after the ranked ones in either direction (Fewest points opens on the lowest place), unnumbered, its total muted.
- **A standing that can't be read ranks nobody.** Its rows are replaced by an error with Try again; ranking the chapter at 0 would be a wrong answer, not a missing one.
- **A module that is off offers no standing** and its board is never read.

## Where points are read

Since #5950 (Paul's pick, 2026-11-24) points have no page in the web sidebar and no tab on the phone; each thing the Points page held lives where the person or the chapter's records are.

- **Your own points** open from your own profile.
  On web the Points door in Profile's **All time** frame opens a panel docked in place of the page (`/profile?open=points`; `/points` redirects there): the balance for a period (All time, This semester, This month, or an archived semester), your place this semester with a **Standings** link to the Directory's points standing (for a viewer who can open the Directory), and every transaction behind the number, newest first, with category and amount (earned or taken away) filters, a search field once it holds 15 rows, and Export.
  On the phone the points figure at the top right of You, and the This semester Points gauge, push the **Points** screen ([`../ui/mobile/screens.md` § Points](../ui/mobile/screens.md#points)), with the same periods, rank and rows.
  A points notification and the assistant's "your points" source open them on both apps; its "Points standings" source opens the Directory's points standing (the source page `standings`, apart from `points` since #5950).
- **Standings** are the Directory's sorts ([§ Standings](#standings)).
- **The chapter ledger** is on the Points page of Chapter settings, the `points-ledger` tool, for `points:view_all` ([`settings/README.md` § Who sees what](settings/README.md#who-sees-what)): every transaction in the chapter, newest first, a page at a time, filtered by category, by member, or to flagged ones only, with Export and Refresh ([§ Chapter-wide transaction list](#chapter-wide-transaction-list)).
  A `points:view_all` holder reaches it on one member from the Points row of that member's card (`/settings?tab=points&member=<user id>`).
- **Adjust points** (`points:adjust`, while Points is on) is in two places on web: the ledger's header, which asks who, and the `⋯` of a member's card, first, which starts from that member and is never offered on your own card.
  Opened from a card, the form names the member in its title ("Adjust Sam's points") and asks only the amount, category and reason.
  Both are held while the chapter's plan refuses writes.
  The phone has no Adjust points form ([`../ui/mobile/screens.md` § s23](../ui/mobile/screens.md#s23-adjust-points-sheet-admin)); points also move through chat's `/points` ([§ Chat Integration](#chat-integration)) and Frapp Intelligence's Give points card ([`ai.md`](ai.md)).

## Chapter-wide transaction list

- `GET /v1/points/transactions` returns a **newest-first**, cursor-paginated slice of `point_transactions` for the active chapter. It backs the chapter points ledger in Chapter settings ([§ Where points are read](#where-points-are-read): filters for member, category, flagged state, and deep pagination).
- Requires `points:view_all` (same permission as viewing another member’s point summary on `GET /v1/points/members/:userId`).
- Query parameters (all optional unless noted):
  - `user_id` — restrict to one member’s rows.
  - `category` — any value the [`point_transactions.category` column](../architecture/README.md#points--events) allows.
  - `flagged` — boolean filter; when true, returns only rows the anomaly rules marked for review. The exact string-to-boolean parsing rules (`true`/`false`/`1`/`0`) are an API-layer detail documented in the OpenAPI spec.
  - `before` — ISO8601 timestamp cursor; return transactions created **strictly before** this instant (older page).
  - `limit` — page size; default **50**, clamped to **1–200** inclusive on the server.
- Ordering and caps are implementation details of the list endpoint; the **append-only** and **immutability** rules in *Anti-Fraud* still apply to underlying rows.

## Edge Cases

- Negative balances are allowed. The system does not block fines even if the balance would go negative.
- If a member is removed from a chapter, their point history is preserved for audit purposes **and they keep their leaderboard row**. `get_points_leaderboard` aggregates `point_transactions` by chapter and does not join `members` (the roster only adds members at 0), so removing someone does not silently move everyone ranked below them. They are no longer on the roster, so the Directory's standings hold their place without drawing a row for it (*Leaderboard*). They also can't be adjusted any more (*Admin Adjustments*). That includes a retry of an adjustment that committed before they left: the retry gets the 404 rather than the original row, which stays in the ledger.
- Points awarded for study sessions and events cannot be manually reversed by the recipient; only admins can create offsetting transactions.

## Chat Integration

Points is dispatched from chat by the `/points grant|deduct @member <amount> for <reason>` slash command (gated on the `points` module). `grant` posts a `+amount` `MANUAL` adjustment, `deduct` a `−amount` `FINE`; both run through `POST /v1/points/adjust`, so every chat-originated change inherits the same anti-fraud rules above (reason required, no self-adjust, the adjustments/hour rate limit, anomaly flagging, append-only, and idempotency on `client_message_id`).

The resulting **`points` card** (`actor → recipient`, signed amount, reason) is **server-originated**: only `PointsService.adjustPoints` writes it, after the ledger row commits, and a client cannot post a `kind:"points"` card directly (it is rejected by the chat send path). This makes the card impossible to forge — it can exist only if a real transaction does. The card is append-only and carries no actions; corrections are new adjustments, never edits. The card post is best-effort: a failed post never rolls back the committed ledger row — but it is no longer silent, and a lost card is no longer unhealable. The ledger row records the origin `channel_id` next to `client_message_id`; a replay re-attempts the card into that stored channel (and 409s if the request names a different one). The route reports the outcome as `card_posted`; on an explicit `false` the client keeps a non-retryable `_status: "recorded"` timeline row rather than dropping the placeholder (the toast is secondary and evictable). The full three-state contract (`true` / `false` / absent, and what a replay reports) lives in [`integrations.md`](chat/integrations.md) → *Slash command dispatch* and is not restated here.

Full slash/renderer/anti-forgery mechanics: see [`integrations.md`](integrations.md) → *Slash command dispatch* and *Server-originated kinds*.
