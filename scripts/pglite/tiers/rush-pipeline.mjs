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

  await db.query(`select public.anonymize_user($1)`, [U.a]);
  checks.push([
    (await count("rush_candidate_ratings", `rater_id = '${U.a}'`)) === 0 &&
      (await count("rush_candidate_ratings", `rater_id = '${U.b}'`)) === 1,
    "account deletion deletes the member's ratings and nobody else's",
  ]);
  checks.push([
    (await count("rush_candidate_notes", `author_id = '${U.a}'`)) === 1,
    "account deletion keeps the notes the member wrote",
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
    delete from chapters where id in ('${CH.a}', '${CH.b}');
    delete from users where id in ('${U.a}', '${U.b}');
  `);
} catch (e) {
  miss();
  console.log(
    `MISS  recruitment pipeline (#5924)\n        ↳ ${String(e?.message ?? e).split("\n")[0]}`,
  );
}
