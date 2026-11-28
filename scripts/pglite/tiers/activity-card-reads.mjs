import { db, miss } from "../harness.mjs";

// ─── Activity's chat cards in one read (#6061 step 2) ───────────────────────
//
// `activity_card_reads` is called only through a faked repository in the Jest
// suites, so this is the one place CI runs its rules. What each scenario
// pins, and the edit it catches:
// - each kind is capped at `p_limit`, newest first, inside the chapter, with
//   deleted rows left out, and the caller's own polls are found past the cap;
// - votes and form answers are the caller's alone, on the cards it read;
// - claims are every member's, but none on a sheet the caller posted, and a
//   reaction is not a claim;
// - `p_polls` and `p_cards` each switch their half off;
// - only the service role may run it.
try {
  const CH = "a6a6a6a6-0000-4000-8000-000000006061";
  const CH_OTHER = "a6a6a6a6-0000-4000-8000-000000016061";
  const ME = "a7a7a7a7-0000-4000-8000-00000000000a";
  const OTHER = "a7a7a7a7-0000-4000-8000-00000000000b";
  const C = "a8a8a8a8-0000-4000-8000-000000000001";
  const C_OTHER = "a8a8a8a8-0000-4000-8000-000000000002";
  const id = (n) => `a9a9a9a9-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const M = {
    myOldPoll: id(1),
    poll1: id(2),
    poll2: id(3),
    poll3: id(4),
    deletedPoll: id(5),
    elsewherePoll: id(6),
    signup1: id(7),
    signup2: id(8),
    mySignup: id(9),
    form1: id(10),
  };
  const LABEL = Object.fromEntries(Object.entries(M).map(([k, v]) => [v, k]));
  const at = (minutes) =>
    `'2026-11-01T12:00:00Z'::timestamptz + interval '${minutes} minutes'`;
  const msg = (key, channel, sender, kind, minutes, deleted = false) =>
    `('${M[key]}', '${channel}', '${sender}', '${kind}', 'TEXT', '${kind}', '{"title":"Card"}', ${deleted}, ${at(minutes)})`;
  await db.exec(`
    insert into chapters (id, name, university) values
      ('${CH}', 'Activity cards', 'U'), ('${CH_OTHER}', 'Activity cards other', 'U');
    insert into users (id, supabase_auth_id, email, display_name) values
      ('${ME}', gen_random_uuid(), 'cards-me@example.com', 'Me'),
      ('${OTHER}', gen_random_uuid(), 'cards-other@example.com', 'Other');
    insert into chat_channels (id, chapter_id, name, type, member_ids) values
      ('${C}', '${CH}', 'general', 'PUBLIC', '{}'::uuid[]),
      ('${C_OTHER}', '${CH_OTHER}', 'general', 'PUBLIC', '{}'::uuid[]);
    insert into chat_messages (id, channel_id, sender_id, content, type, kind, payload, is_deleted, created_at) values
      ${msg("myOldPoll", C, ME, "poll", 1)},
      ${msg("poll1", C, OTHER, "poll", 2)},
      ${msg("poll2", C, OTHER, "poll", 3)},
      ${msg("poll3", C, OTHER, "poll", 4)},
      ${msg("deletedPoll", C, OTHER, "poll", 5, true)},
      ${msg("elsewherePoll", C_OTHER, ME, "poll", 6)},
      ${msg("mySignup", C, ME, "signup", 0)},
      ${msg("signup1", C, OTHER, "signup", 7)},
      ${msg("signup2", C, OTHER, "signup", 8)},
      ${msg("form1", C, OTHER, "form", 9)};
    insert into chat_message_actions (message_id, user_id, action_type, payload) values
      ('${M.poll3}', '${ME}', 'vote', '{"option_ids":["a"]}'),
      ('${M.elsewherePoll}', '${ME}', 'vote', '{"option_ids":["a"]}'),
      ('${M.poll3}', '${OTHER}', 'vote', '{"option_ids":["b"]}'),
      ('${M.signup1}', '${OTHER}', 'signup', '{"slot_ids":["s1"]}'),
      ('${M.signup2}', '${ME}', 'signup', '{"slot_ids":["s2"]}'),
      ('${M.mySignup}', '${OTHER}', 'signup', '{"slot_ids":["s3"]}'),
      ('${M.signup1}', '${ME}', 'reaction', '{}');
    insert into chat_form_responses (message_id, user_id, answers) values
      ('${M.form1}', '${ME}', '{"q":"mine"}'),
      ('${M.form1}', '${OTHER}', '{"q":"theirs"}');
  `);

  const read = async (limit, polls = true, cards = true) =>
    (
      await db.query(
        `select public.activity_card_reads($1, $2, $3, $4, $5) as r`,
        [CH, ME, limit, polls, cards],
      )
    ).rows[0].r;
  const names = (rows) => rows.map((r) => LABEL[r.id] ?? r.id).join(",");
  const pairs = (rows, who) =>
    rows
      .map(
        (r) =>
          `${LABEL[r.message_id] ?? r.message_id}${who ? `:${r.user_id === ME ? "me" : "other"}` : ""}`,
      )
      .sort()
      .join(",");

  const two = await read(2);
  const three = await read(3);
  const pollsOff = await read(2, false, true);
  const cardsOff = await read(2, true, false);
  const roles = (
    await db.query(
      `select rolname from pg_roles where rolname in ('authenticated', 'service_role')`,
    )
  ).rows.map((r) => r.rolname);
  const grants = (
    await db.query(
      `select r as role, has_function_privilege(r, 'public.activity_card_reads(uuid,uuid,integer,boolean,boolean)', 'execute') as ok
         from unnest($1::text[]) r order by r`,
      [roles],
    )
  ).rows
    .map((r) => `${r.role}=${r.ok}`)
    .join(" ");
  const wantGrants = roles
    .sort()
    .map((r) => `${r}=${r === "service_role"}`)
    .join(" ");

  const SCENARIOS = [
    {
      name: "each kind is capped newest first inside the chapter, without deleted rows",
      got: `${names(two.polls)} | ${names(two.signups)} | ${names(two.forms)}`,
      want: "poll3,poll2 | signup2,signup1 | form1",
    },
    {
      name: "the caller's own poll is found past the chapter-wide cap",
      got: names(two.own_polls),
      want: "myOldPoll",
    },
    {
      name: "votes and form answers are the caller's alone, on the cards read",
      got: `${pairs(two.votes)} | ${pairs(two.form_answers)} | ${"answers" in (two.form_answers[0] ?? {})}`,
      want: "poll3 | form1 | false",
    },
    {
      name: "claims are every member's, none on the caller's own sheet, and no reaction",
      got: pairs(three.signup_claims, true),
      want: "signup1:other,signup2:me",
    },
    {
      name: "p_polls and p_cards each switch their half off",
      got: `${pollsOff.polls.length + pollsOff.own_polls.length + pollsOff.votes.length}/${pollsOff.signups.length} ${cardsOff.signups.length + cardsOff.forms.length + cardsOff.signup_claims.length + cardsOff.form_answers.length}/${cardsOff.polls.length}`,
      want: "0/2 0/2",
    },
    {
      name: "only the service role may run it",
      got: grants,
      want: wantGrants,
    },
  ];
  for (const s of SCENARIOS) {
    if (s.got === s.want) {
      console.log(`OK    ${s.name}`);
    } else {
      miss();
      console.log(
        `MISS  ${s.name}\n        ↳ expected ${s.want}, got ${s.got}`,
      );
    }
  }

  await db.exec(`
    delete from chapters where id in ('${CH}', '${CH_OTHER}');
    delete from users where id in ('${ME}', '${OTHER}');
  `);
} catch (e) {
  miss();
  console.log(
    `MISS  activity card reads\n        ↳ ${String(e?.message ?? e).split("\n")[0]}`,
  );
}
