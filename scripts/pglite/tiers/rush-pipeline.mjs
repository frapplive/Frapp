import { db, miss } from "../harness.mjs";

// ─── Recruitment pipeline (#5924) ───────────────────────────────────────────
//
// `rush_stages`, `rush_tags`, `rush_candidate_tags`, `rush_candidate_notes`,
// `rush_candidate_ratings` and their `anonymize_user` purge are reached from
// the API only through mocked repositories, so this is the one place their
// SQL runs. What each check pins, and the edit it catches:
// - a tag, note or rating can't point at a candidate in another chapter: the
//   composite `(id, chapter_id)` foreign keys hold even if the API's chapter
//   filter were lost;
// - tag names are unique in a chapter whatever their case, which is the
//   23505 the API turns into its 409;
// - one rating per member per candidate, 1 to 5, and the API's upsert target
//   `(candidate_id, rater_id)` names a real constraint;
// - a stage's key is unique in its chapter, and its category is one of six;
// - account deletion deletes the member's ratings and nobody else's, and
//   keeps their notes. The users row is tombstoned, not deleted, so the
//   foreign key's cascade never fires: a later `anonymize_user` copied from
//   an older migration would silently drop the purge, and only this check
//   would notice.
// Slice 2 (#5934) adds:
// - a contact can't land on another chapter's candidate, and its kind is one
//   of six;
// - the dispatch log takes the two new sweeps' claims (`RUSH_CANDIDATE`,
//   `FOLLOW_UP` and `STALE`), which a check constraint would otherwise refuse
//   at the first morning push;
// - account deletion clears the prospects the member owned and the
//   follow-ups set for them, touches nobody else's, and keeps their contacts.
// Slice 3 (#5973) adds:
// - a candidate starts with no bid, and a bid's state is one of six;
// - `expire_rush_bids` expires only open bids past their day, writes the
//   shipped clients' `bid_status` with them, clears a recorded acceptance and
//   deletes its pending confirmation (with the PNM's email), and leaves an
//   answered or later bid alone; the API calls it from the hourly sweep with
//   its own mocked repository, so this is the one place it runs;
// - a pending confirmation can't point at another chapter's candidate, and
//   two confirmations without a token (no email) can coexist.
try {
  const U = {
    a: "c5c5c5c5-0000-4000-8000-00000000000a",
    b: "c5c5c5c5-0000-4000-8000-00000000000b",
  };
  const CH = {
    a: "c5c5c5c5-0000-4000-8000-0000000000ca",
    b: "c5c5c5c5-0000-4000-8000-0000000000cb",
  };
  const CAND = {
    a: "c5c5c5c5-0000-4000-8000-0000000000aa",
    b: "c5c5c5c5-0000-4000-8000-0000000000bb",
  };
  const TAG = {
    a: "c5c5c5c5-0000-4000-8000-00000000001a",
    b: "c5c5c5c5-0000-4000-8000-00000000001b",
  };
  await db.exec(`
    insert into users (id, supabase_auth_id, email, display_name) values
      ('${U.a}', gen_random_uuid(), 'rush-a@example.com', 'A'),
      ('${U.b}', gen_random_uuid(), 'rush-b@example.com', 'B');
    insert into chapters (id, name, university) values
      ('${CH.a}', 'Rush A', 'U'),
      ('${CH.b}', 'Rush B', 'U');
    insert into rush_candidates (id, chapter_id, display_name, created_by) values
      ('${CAND.a}', '${CH.a}', 'Jane', '${U.a}'),
      ('${CAND.b}', '${CH.b}', 'Jane', '${U.b}');
    insert into rush_tags (id, chapter_id, label) values
      ('${TAG.a}', '${CH.a}', 'Legacy'),
      ('${TAG.b}', '${CH.b}', 'Legacy');
  `);

  const rejects = async (sql) => {
    try {
      await db.exec(sql);
      return false;
    } catch {
      return true;
    }
  };
  const count = async (table, where) =>
    (await db.query(`select count(*)::int as n from ${table} where ${where}`))
      .rows[0].n;
  const checks = [];

  checks.push([
    await rejects(
      `insert into rush_candidate_tags (candidate_id, tag_id, chapter_id)
         values ('${CAND.a}', '${TAG.b}', '${CH.a}');`,
    ),
    "a candidate can't take another chapter's tag",
  ]);
  checks.push([
    await rejects(
      `insert into rush_candidate_notes (candidate_id, chapter_id, author_id, body)
         values ('${CAND.b}', '${CH.a}', '${U.a}', 'x');`,
    ),
    "a note can't land on another chapter's candidate",
  ]);
  checks.push([
    await rejects(
      `insert into rush_candidate_ratings (candidate_id, chapter_id, rater_id, rating)
         values ('${CAND.b}', '${CH.a}', '${U.a}', 3);`,
    ),
    "a rating can't land on another chapter's candidate",
  ]);
  checks.push([
    await rejects(
      `insert into rush_tags (chapter_id, label) values ('${CH.a}', ' legacy ');`,
    ),
    "a chapter keeps one tag per name, whatever its case",
  ]);
  checks.push([
    await rejects(
      `insert into rush_candidate_ratings (candidate_id, chapter_id, rater_id, rating)
         values ('${CAND.a}', '${CH.a}', '${U.a}', 6);`,
    ),
    "a rating is 1 to 5",
  ]);

  await db.exec(`
    insert into rush_candidate_ratings (candidate_id, chapter_id, rater_id, rating)
      values ('${CAND.a}', '${CH.a}', '${U.a}', 4), ('${CAND.a}', '${CH.a}', '${U.b}', 2);
    insert into rush_candidate_ratings (candidate_id, chapter_id, rater_id, rating)
      values ('${CAND.a}', '${CH.a}', '${U.a}', 5)
      on conflict (candidate_id, rater_id) do update set rating = excluded.rating;
    insert into rush_candidate_notes (candidate_id, chapter_id, author_id, body)
      values ('${CAND.a}', '${CH.a}', '${U.a}', 'Great at tabling');
    insert into rush_stages (chapter_id, key, label, category, position)
      values ('${CH.a}', 'new', 'New', 'new', 0);
  `);
  checks.push([
    (await count(
      "rush_candidate_ratings",
      `rater_id = '${U.a}' and rating = 5`,
    )) === 1,
    "a member's second rating replaces the first through the API's upsert target",
  ]);
  checks.push([
    (await rejects(
      `insert into rush_stages (chapter_id, key, label, category, position)
         values ('${CH.a}', 'new', 'Lead', 'new', 1);`,
    )) &&
      (await rejects(
        `insert into rush_stages (chapter_id, key, label, category, position)
           values ('${CH.a}', 'other', 'Other', 'pending', 1);`,
      )),
    "a stage key is unique in its chapter and its category is one of six",
  ]);

  checks.push([
    (await rejects(
      `insert into rush_candidate_contacts (candidate_id, chapter_id, logged_by, kind, contacted_on)
         values ('${CAND.b}', '${CH.a}', '${U.a}', 'text', '2026-11-20');`,
    )) &&
      (await rejects(
        `insert into rush_candidate_contacts (candidate_id, chapter_id, logged_by, kind, contacted_on)
           values ('${CAND.a}', '${CH.a}', '${U.a}', 'pigeon', '2026-11-20');`,
      )),
    "a contact stays in its candidate's chapter and its kind is one of six (#5934)",
  ]);
  await db.exec(`
    insert into rush_candidate_contacts (candidate_id, chapter_id, logged_by, kind, contacted_on)
      values ('${CAND.a}', '${CH.a}', '${U.a}', 'call', '2026-11-20');
    update rush_candidates
       set owner_id = '${U.a}', follow_up_on = '2026-11-26',
           follow_up_note = 'Dinner', follow_up_user_id = '${U.a}'
     where id = '${CAND.a}';
    update rush_candidates
       set owner_id = '${U.b}', follow_up_on = '2026-11-26',
           follow_up_user_id = '${U.b}'
     where id = '${CAND.b}';
    insert into scheduled_notification_dispatches
      (chapter_id, entity_type, entity_id, threshold, due_date)
      values ('${CH.a}', 'RUSH_CANDIDATE', '${CAND.a}', 'FOLLOW_UP', '2026-11-26'),
             ('${CH.a}', 'RUSH_CANDIDATE', '${CAND.a}', 'STALE', '2026-11-27');
  `);
  checks.push([
    (await count(
      "scheduled_notification_dispatches",
      `entity_type = 'RUSH_CANDIDATE'`,
    )) === 2,
    "the dispatch log takes the follow-up and stale claims (#5934)",
  ]);

  await db.query(`select public.anonymize_user($1)`, [U.a]);
  checks.push([
    (await count(
      "rush_candidates",
      `id = '${CAND.a}' and owner_id is null and follow_up_on is null and follow_up_note is null and follow_up_user_id is null`,
    )) === 1 &&
      (await count(
        "rush_candidates",
        `id = '${CAND.b}' and owner_id = '${U.b}' and follow_up_user_id = '${U.b}'`,
      )) === 1,
    "account deletion clears the member's prospects and follow-ups, nobody else's (#5934)",
  ]);
  checks.push([
    (await count("rush_candidate_contacts", `logged_by = '${U.a}'`)) === 1,
    "account deletion keeps the contacts the member logged (#5934)",
  ]);
  checks.push([
    (await count("rush_candidate_ratings", `rater_id = '${U.a}'`)) === 0 &&
      (await count("rush_candidate_ratings", `rater_id = '${U.b}'`)) === 1,
    "account deletion deletes the member's ratings and nobody else's",
  ]);
  checks.push([
    (await count("rush_candidate_notes", `author_id = '${U.a}'`)) === 1,
    "account deletion keeps the notes the member wrote",
  ]);

  // Bids (#5973).
  const BID = {
    due: "c5c5c5c5-0000-4000-8000-0000000000d1",
    open: "c5c5c5c5-0000-4000-8000-0000000000d2",
    answered: "c5c5c5c5-0000-4000-8000-0000000000d3",
  };
  await db.exec(`
    insert into rush_candidates (id, chapter_id, display_name, created_by) values
      ('${BID.due}', '${CH.a}', 'Due', '${U.b}'),
      ('${BID.open}', '${CH.a}', 'Open', '${U.b}'),
      ('${BID.answered}', '${CH.a}', 'Answered', '${U.b}');
  `);
  checks.push([
    (await count(
      "rush_candidates",
      `id = '${BID.due}' and bid_state = 'none' and bid_status = 'none'`,
    )) === 1,
    "a new candidate has no bid (#5973)",
  ]);
  checks.push([
    await rejects(
      `update rush_candidates set bid_state = 'maybe' where id = '${BID.due}';`,
    ),
    "a bid's state is one of six (#5973)",
  ]);
  await db.exec(`
    update rush_candidates
       set bid_state = 'extended', bid_status = 'extended',
           bid_expires_at = '2026-12-01T00:00:00Z',
           bid_acceptance_recorded_at = '2026-11-25T00:00:00Z',
           bid_acceptance_recorded_by = '${U.b}'
     where id = '${BID.due}';
    update rush_candidates
       set bid_state = 'extended', bid_status = 'extended',
           bid_expires_at = '2026-12-09T00:00:00Z'
     where id = '${BID.open}';
    update rush_candidates
       set bid_state = 'declined', bid_expires_at = '2026-11-30T00:00:00Z'
     where id = '${BID.answered}';
    insert into rush_bid_confirmations (candidate_id, chapter_id, email, token_hash)
      values ('${BID.due}', '${CH.a}', 'due@example.com', 'hash-due'),
             ('${BID.open}', '${CH.a}', null, null),
             ('${BID.answered}', '${CH.a}', null, null);
  `);
  checks.push([
    await rejects(
      `insert into rush_bid_confirmations (candidate_id, chapter_id)
         values ('${CAND.b}', '${CH.a}');`,
    ),
    "a bid confirmation can't land on another chapter's candidate (#5973)",
  ]);
  const expired = (
    await db.query(
      `select public.expire_rush_bids('2026-12-02T00:00:00Z'::timestamptz) as n`,
    )
  ).rows[0].n;
  checks.push([
    expired === 1 &&
      (await count(
        "rush_candidates",
        `id = '${BID.due}' and bid_state = 'expired' and bid_status = 'none'
           and bid_answered_via = 'system' and bid_acceptance_recorded_at is null`,
      )) === 1 &&
      (await count("rush_bid_confirmations", `candidate_id = '${BID.due}'`)) ===
        0,
    "expire_rush_bids expires a bid past its day, its recorded acceptance and its emailed confirmation with it (#5973)",
  ]);
  checks.push([
    (await count(
      "rush_candidates",
      `(id = '${BID.open}' and bid_state = 'extended')
         or (id = '${BID.answered}' and bid_state = 'declined')`,
    )) === 2 &&
      (await count(
        "rush_bid_confirmations",
        `candidate_id = '${BID.open}'`,
      )) === 1 &&
      (await count(
        "rush_bid_confirmations",
        `candidate_id = '${BID.answered}'`,
      )) === 0,
    "expire_rush_bids leaves an open bid not yet due and an answered one alone, and clears the answered one's leftover confirmation (#5973)",
  ]);
  checks.push([
    (
      await db.query(
        `select public.expire_rush_bids('2026-12-02T00:00:00Z'::timestamptz) as n`,
      )
    ).rows[0].n === 0,
    "expire_rush_bids expires each bid once (#5973)",
  ]);

  console.log("\n=== Recruitment pipeline (#5924) ===");
  for (const [ok, name] of checks) {
    if (ok) {
      console.log(`OK    ${name}`);
    } else {
      miss();
      console.log(`MISS  ${name} (#5924)`);
    }
  }

  await db.exec(`
    delete from scheduled_notification_dispatches where entity_type = 'RUSH_CANDIDATE';
    delete from chapters where id in ('${CH.a}', '${CH.b}');
    delete from users where id in ('${U.a}', '${U.b}');
  `);
} catch (e) {
  miss();
  console.log(
    `MISS  recruitment pipeline (#5924)\n        ↳ ${String(e?.message ?? e).split("\n")[0]}`,
  );
}
