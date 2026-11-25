import { db, miss } from "../harness.mjs";

// ─── Functional: chapter interest forms (20261125005308, #5977) ─────────────
//
// `spec/behavior/ifc-recruitment.md` § Chapter interest forms, proven on the
// database functions the API calls:
//
//   - a code goes only to an address on the chapter's school domains, only
//     while the form is open, never for an NPHC chapter, and a chapter with
//     no school takes any address;
//   - a matched code mints a proof the submission spends once;
//   - one submission, one transaction: the PNM, the interest, the chapter's
//     candidate in its first stage with `pnm_id`, and the push-up to the
//     council when the link is accepted (a council registration), with the
//     consent record stored;
//   - a repeat submission updates the candidate rather than adding one;
//   - two PNMs may share a name, a hand-added name still may not, and a
//     hand-added candidate of the same name is offered as a link, never
//     linked;
//   - the referrer text names a member only when exactly one matches;
//   - a pending council link feeds only the chapter, and accepting it pushes
//     the chapter's form PNMs up;
//   - a chapter with no school matches its own submissions, with no
//     school-wide record;
//   - RLS on and no policy on the new tables, and no new function callable
//     by `anon` or `authenticated`.
//
// The rows are deleted at the end.
console.log("\n=== Functional: chapter interest forms (20261125005308) ===");
try {
  const P = "c5977000-0000-4000-8000-0000000000";
  const SCHOOL = `${P}a1`;
  const CH_A = `${P}c1`;
  const CH_B = `${P}c2`;
  const CH_NPHC = `${P}c3`;
  const CH_LONE = `${P}c4`;
  const IFC = `${P}d1`;
  const USER = `${P}e1`;
  const REFERRER = `${P}e2`;
  const NAMESAKE = `${P}e3`;

  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const fn = async (sql, params) => Object.values(await one(sql, params))[0];
  const fails = async (sql, params = []) => {
    try {
      await db.query(sql, params);
      return "succeeded";
    } catch (e) {
      return String(e?.message ?? e).split("\n")[0];
    }
  };

  await db.query(
    `insert into schools (id, name, short_name, status) values ($1, 'Form Tier School', 'FTS', 'verified')`,
    [SCHOOL],
  );
  await db.query(
    `insert into school_email_domains (school_id, domain, status, verified_via)
     values ($1, 'fts-tier.edu', 'verified', 'staff')`,
    [SCHOOL],
  );
  await db.query(
    `insert into users (id, email, display_name, supabase_auth_id) values
       ($1, 'form-tier-1@example.com', 'Form Officer', gen_random_uuid()),
       ($2, 'form-tier-2@example.com', 'Sam Lee', gen_random_uuid()),
       ($3, 'form-tier-3@example.com', 'Kim Park', gen_random_uuid())`,
    [USER, REFERRER, NAMESAKE],
  );
  await db.query(
    `insert into chapters (id, name, university, org_archetype) values
       ($1, 'Form Alpha', 'FTS', 'ifc'), ($2, 'Form Beta', 'FTS', 'ifc'),
       ($3, 'Form Nphc', 'FTS', 'nphc'), ($4, 'Form Lone', 'Nowhere', 'ifc')`,
    [CH_A, CH_B, CH_NPHC, CH_LONE],
  );
  await db.query(
    `insert into chapters (id, name, university, kind, council_type, recruitment_model,
                           council_school_id, org_archetype, council_verified_at)
     values ($1, 'Form IFC', 'FTS', 'council', 'ifc', 'open_bidding', $2, 'council', now())`,
    [IFC, SCHOOL],
  );
  await db.query(
    `insert into members (user_id, chapter_id) values ($1, $3), ($2, $3)`,
    [REFERRER, NAMESAKE, CH_A],
  );
  for (const chapter of [CH_A, CH_B, CH_NPHC]) {
    const link = await one(
      `insert into school_chapters (school_id, chapter_id, proposed_by)
       values ($1, $2, $3) returning id`,
      [SCHOOL, chapter, USER],
    );
    await fn(`select public.set_school_chapter_status($1, $2, 'active', $3)`, [
      link.id,
      chapter,
      USER,
    ]);
  }
  const councilLink = (chapter, side, status) =>
    fn(`select public.set_council_chapter_status($1, $2, $3, $4, $5, null)`, [
      IFC,
      chapter,
      side,
      status,
      USER,
    ]);
  await councilLink(CH_A, "council", "proposed");
  await councilLink(CH_A, "chapter", "accepted");
  await councilLink(CH_B, "council", "proposed"); // still pending
  await db.query(
    `insert into council_recruitment_seasons (council_id, term, opens_at, closes_at, status)
     values ($1, 'Spring 2027', now() - interval '1 day', now() + interval '30 days', 'open')`,
    [IFC],
  );

  const form = async (chapter, slug, open = true) =>
    (
      await one(
        `insert into chapter_interest_forms (chapter_id, slug, is_open, questions)
         values ($1, $2, $3, '[{"id":"q1","type":"short_answer","title":"Major?","required":false}]')
         returning id`,
        [chapter, slug, open],
      )
    ).id;
  const FORM_A = await form(CH_A, "formtiera1");
  const FORM_B = await form(CH_B, "formtierb1");
  const FORM_NPHC = await form(CH_NPHC, "formtiern1");
  const FORM_LONE = await form(CH_LONE, "formtierl1");
  const FORM_CLOSED_CHAPTER = CH_A; // its second form is refused below
  await db.query(
    `insert into chapter_interest_form_labels (form_id, label) values ($1, 'tabling-quad')`,
    [FORM_A],
  );
  const secondLive = await fails(
    `insert into chapter_interest_forms (chapter_id, slug) values ($1, 'formtiera2')`,
    [FORM_CLOSED_CHAPTER],
  );

  const start = (formId, email, ip = "ip-1") =>
    fn(
      `select public.start_interest_form_code($1, $2, 'salt', 'code-hash', $3, 600, 3600, 6, 200, 0)`,
      [formId, email, ip],
    );
  const confirm = (formId, id, codeHash, proof = "proof-hash") =>
    fn(`select public.confirm_interest_form_code($1, $2, $3, $4, 1800, 5)`, [
      formId,
      id,
      codeHash,
      proof,
    ]);
  let tokens = 0;
  const submit = (formId, id, proof, first, last, extra = {}) =>
    fn(
      `select public.submit_interest_form($1, $2, $3, $4, $5, null, 2030::smallint,
                                          $6, $7::jsonb, $8, $9, '2026-11-24', array['agree_18'],
                                          $10, 31536000)`,
      [
        formId,
        id,
        proof,
        first,
        last,
        extra.phone ?? null,
        JSON.stringify(extra.answers ?? { q1: "Physics" }),
        extra.referrer ?? null,
        extra.label ?? null,
        extra.token ?? `tok-${(tokens += 1)}`,
      ],
    );
  /** A code sent, matched and spent: the whole verify-first path. */
  const verified = async (formId, email, proof = "proof-hash") => {
    const sent = await start(formId, email);
    await confirm(formId, sent.id, "code-hash", proof);
    return sent.id;
  };

  // ── Codes ──
  const offDomain = await start(FORM_A, "pat@gmail.com");
  const nphc = await start(FORM_NPHC, "pat@fts-tier.edu");
  await db.query(
    `update chapter_interest_forms set is_open = false where id = $1`,
    [FORM_B],
  );
  const closed = await start(FORM_B, "pat@fts-tier.edu");
  await db.query(
    `update chapter_interest_forms set is_open = true where id = $1`,
    [FORM_B],
  );
  const lone = await start(FORM_LONE, "anyone@gmail.com");
  const sent = await start(FORM_A, "Pat@FTS-tier.edu");
  const wrong = await confirm(FORM_A, sent.id, "not-the-hash");
  const right = await confirm(FORM_A, sent.id, "code-hash");

  // ── No school, first in the session: its path never reads the school
  // branch's record (a fresh connection's first call must not fail) ──
  const loneFirst = await submit(
    FORM_LONE,
    await verified(FORM_LONE, "anyone@gmail.com", "proof-l1"),
    "proof-l1",
    "Lee",
    "Solo",
  );
  const loneAgain = await submit(
    FORM_LONE,
    await verified(FORM_LONE, "ANYONE@gmail.com", "proof-l2"),
    "proof-l2",
    "Lee",
    "Solo",
    { token: "tok-lone" },
  );
  // ── Ceilings ──
  const startWith = (formId, email, ip, perAddress, perIp, cooldown) =>
    fn(
      `select public.start_interest_form_code($1, $2, 'salt', 'code-hash', $3, 600, 3600, $4, $5, $6)`,
      [formId, email, ip, perAddress, perIp, cooldown],
    );
  const firstOfTwo = await startWith(
    FORM_A,
    "cap@fts-tier.edu",
    "ip-cap",
    6,
    200,
    60,
  );
  const cooldown = await startWith(
    FORM_A,
    "cap@fts-tier.edu",
    "ip-cap",
    6,
    200,
    60,
  );
  await startWith(FORM_A, "cap2@fts-tier.edu", "ip-cap-2", 2, 200, 0);
  await startWith(FORM_A, "cap2@fts-tier.edu", "ip-cap-2", 2, 200, 0);
  const addressCap = await startWith(
    FORM_A,
    "CAP2@fts-tier.edu",
    "ip-cap-3",
    2,
    200,
    0,
  );
  await startWith(FORM_A, "ipa@fts-tier.edu", "ip-busy", 6, 2, 0);
  await startWith(FORM_A, "ipb@fts-tier.edu", "ip-busy", 6, 2, 0);
  const ipCap = await startWith(FORM_A, "ipc@fts-tier.edu", "ip-busy", 6, 2, 0);
  const tries = await start(FORM_A, "tries@fts-tier.edu");
  for (let i = 0; i < 4; i += 1) await confirm(FORM_A, tries.id, "nope");
  const exhausted = await confirm(FORM_A, tries.id, "nope");
  const afterExhausted = await confirm(FORM_A, tries.id, "code-hash");
  // A code or proof from one chapter's form does nothing on another's.
  const crossSent = await start(FORM_B, "cross@fts-tier.edu");
  const crossConfirm = await confirm(FORM_A, crossSent.id, "code-hash");
  await confirm(FORM_B, crossSent.id, "code-hash", "proof-cross");
  const crossSubmit = await submit(
    FORM_A,
    crossSent.id,
    "proof-cross",
    "Cross",
    "Over",
  );

  // ── The submission ──
  const noProof = await submit(FORM_A, sent.id, "wrong-proof", "Pat", "Doe");
  const first = await submit(FORM_A, sent.id, "proof-hash", "Pat", "Doe", {
    referrer: "  sam lee ",
    label: "Tabling-Quad",
    phone: "5550001111",
  });
  const spent = await submit(FORM_A, sent.id, "proof-hash", "Pat", "Doe");
  const phoneKept = await one(
    `select phone, phone_shared from pnms where school_email = 'pat@fts-tier.edu'`,
  );
  const afterFirst = await one(
    `select
       (select count(*)::int from pnms where school_id = $1) as pnms,
       (select count(*)::int from pnm_interests where chapter_id = $2) as interests,
       (select source_label from pnm_interests where chapter_id = $2) as interest_label,
       (select count(*)::int from pnm_council_registrations where council_id = $3) as registrations,
       (select count(*)::int from rush_candidates where chapter_id = $2) as candidates,
       (select stage || ':' || origin || ':' || (pnm_id is not null) || ':' || (created_by is null)
          from rush_candidates where chapter_id = $2) as candidate,
       (select consent_version || ':' || array_to_string(consent_boxes, ',') || ':' ||
               coalesce(source_label, '-') || ':' || (referrer_user_id = $4)
          from interest_form_submissions where chapter_id = $2) as consent`,
    [SCHOOL, CH_A, IFC, REFERRER],
  );

  const again = await submit(
    FORM_A,
    await verified(FORM_A, "pat@fts-tier.edu", "proof-2"),
    "proof-2",
    "Patrick",
    "Doe",
    { token: "tok-pat-a" },
  );
  const afterAgain = await one(
    `select
       (select count(*)::int from pnms where school_id = $1) as pnms,
       (select count(*)::int from rush_candidates where chapter_id = $2) as candidates,
       (select display_name from rush_candidates where chapter_id = $2) as name,
       (select count(*)::int from interest_form_submissions where chapter_id = $2) as submissions`,
    [SCHOOL, CH_A],
  );

  // ── Names ──
  await db.query(
    `insert into rush_candidates (chapter_id, display_name, created_by) values ($1, 'Jordan Ray', $2)`,
    [CH_A, USER],
  );
  const manualTwin = await fails(
    `insert into rush_candidates (chapter_id, display_name, created_by) values ($1, 'Jordan Ray', $2)`,
    [CH_A, USER],
  );
  const noAdder = await fails(
    `insert into rush_candidates (chapter_id, display_name) values ($1, 'Nobody Added')`,
    [CH_A],
  );
  const jordan1 = await submit(
    FORM_A,
    await verified(FORM_A, "jordan1@fts-tier.edu", "proof-j1"),
    "proof-j1",
    "Jordan",
    "Ray",
    { referrer: "Nobody Here" },
  );
  const jordan2 = await submit(
    FORM_A,
    await verified(FORM_A, "jordan2@fts-tier.edu", "proof-j2"),
    "proof-j2",
    "Jordan",
    "Ray",
  );
  const names = await one(
    `select
       (select count(*)::int from rush_candidates where chapter_id = $1 and name_key = 'jordan ray') as jordans,
       (select count(*)::int from interest_form_submissions s
          join rush_candidates rc on rc.id = s.link_candidate_id
         where s.chapter_id = $1 and rc.origin = 'manual') as offered_links,
       (select count(*)::int from rush_candidates
         where chapter_id = $1 and origin = 'manual' and pnm_id is not null) as linked_manual,
       (select count(*)::int from interest_form_submissions
         where candidate_id = $2 and referrer_user_id is not null) as nobody_referred`,
    [CH_A, jordan1.candidate_id],
  );

  // ── Pending link, then accepted ──
  // Pat is on the list already through Alpha; Bo only through Beta.
  const pending = await submit(
    FORM_B,
    await verified(FORM_B, "pat@fts-tier.edu", "proof-b"),
    "proof-b",
    "Pat",
    "Doe",
  );
  await submit(
    FORM_B,
    await verified(FORM_B, "bo@fts-tier.edu", "proof-b2"),
    "proof-b2",
    "Bo",
    "Kay",
    { token: "tok-bo" },
  );
  const beforeAccept = await one(
    `select count(*)::int as n from pnm_interests where chapter_id = $1 and registration_id is not null`,
    [CH_B],
  );
  await councilLink(CH_B, "chapter", "accepted");
  const pushed = await fn(`select public.push_up_chapter_form_interests($1)`, [
    CH_B,
  ]);
  const pushedAgain = await fn(
    `select public.push_up_chapter_form_interests($1)`,
    [CH_B],
  );
  const afterAccept = await one(
    `select count(*)::int as n from pnm_interests where chapter_id = $1 and registration_id is not null`,
    [CH_B],
  );

  const loneRows = await one(
    `select
       (select count(*)::int from rush_candidates where chapter_id = $1) as candidates,
       (select count(*)::int from rush_candidates where chapter_id = $1 and pnm_id is null) as unlinked,
       (select count(*)::int from pnm_interests where chapter_id = $1) as interests`,
    [CH_LONE],
  );

  // ── The withdraw link ──
  const preview = (token) =>
    fn(`select public.preview_interest_form_withdrawal($1)`, [token]);
  const withdrawWith = (token, scope) =>
    fn(`select public.withdraw_interest_form($1, $2)`, [token, scope]);
  const previewPat = await preview("tok-pat-a");
  const previewLone = await preview("tok-lone");
  const badScope = await withdrawWith("tok-pat-a", "both");
  const patOut = await withdrawWith("tok-pat-a", "chapter");
  const patAgain = await withdrawWith("tok-pat-a", "chapter");
  const afterPat = await one(
    `select
       (select stage || ':' || closed_reason from rush_candidates
         where chapter_id = $1 and name_key = 'patrick doe') as a_candidate,
       (select withdrawn_at is not null from pnm_interests i join pnms p on p.id = i.pnm_id
         where i.chapter_id = $1 and p.school_email = 'pat@fts-tier.edu') as a_withdrawn,
       (select count(*)::int from interest_form_submissions
         where chapter_id = $1 and email = 'pat@fts-tier.edu') as a_answers,
       (select count(*)::int from interest_form_submissions
         where chapter_id = $2 and email = 'pat@fts-tier.edu') as b_answers,
       (select count(*)::int from pnms where school_email = 'pat@fts-tier.edu') as pnm`,
    [CH_A, CH_B],
  );
  const boGone = await withdrawWith("tok-bo", "everywhere");
  const afterBo = await one(
    `select
       (select count(*)::int from pnms where school_email = 'bo@fts-tier.edu') as pnm,
       (select count(*)::int from interest_form_submissions where email = 'bo@fts-tier.edu') as answers,
       (select display_name || ':' || stage || ':' || closed_reason || ':' || (pnm_id is null)
          from rush_candidates where chapter_id = $1 and name_key = 'withdrawn prospect') as candidate`,
    [CH_B],
  );
  const loneGone = await withdrawWith("tok-lone", "everywhere");
  const afterLone = await one(
    `select
       (select count(*)::int from interest_form_submissions where email = 'anyone@gmail.com') as answers,
       (select display_name || ':' || closed_reason from rush_candidates where chapter_id = $1) as candidate`,
    [CH_LONE],
  );
  await db.query(
    `update interest_form_submissions set withdraw_expires_at = now() - interval '1 second'
      where candidate_id = $1`,
    [jordan1.candidate_id],
  );
  const expired = await preview("tok-expired-not-real");
  const expiredReal = await one(
    `select public.withdraw_interest_form(withdraw_token_hash, 'chapter') as r
       from interest_form_submissions where candidate_id = $1 limit 1`,
    [jordan1.candidate_id],
  );

  // ── Replacing a form ──
  const replaced = await one(
    `select * from public.replace_interest_form($1, 'formtiera9', $2)`,
    [CH_A, USER],
  );
  const afterReplace = await one(
    `select
       (select count(*)::int from chapter_interest_forms where chapter_id = $1 and replaced_at is null) as live,
       (select is_open from chapter_interest_forms where slug = 'formtiera1') as old_open,
       (select count(*)::int from chapter_interest_form_labels where form_id = $2) as labels`,
    [CH_A, replaced.id],
  );
  const oldSlug = await start(FORM_A, "late@fts-tier.edu");

  const posture = (
    await db.query(`
      select c.relname, c.relrowsecurity,
             (select count(*)::int from pg_policies p
               where p.schemaname = 'public' and p.tablename = c.relname) as policies
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname in ('chapter_interest_forms', 'chapter_interest_form_labels',
                           'interest_form_verifications', 'interest_form_submissions')`)
  ).rows;
  const callable = (
    await db.query(`
      select r.rolname || ':' || f.name as grant
        from pg_roles r
        cross join (values
          ('public.start_interest_form_code(uuid, text, text, text, text, integer, integer, integer, integer, integer)'),
          ('public.confirm_interest_form_code(uuid, uuid, text, text, integer, integer)'),
          ('public.submit_interest_form(uuid, uuid, text, text, text, text, smallint, text, jsonb, text, text, text, text[], text, integer)'),
          ('public.push_up_chapter_form_interests(uuid)'),
          ('public.interest_form_push_target(uuid, uuid)'),
          ('public.interest_form_school_for(uuid, text)'),
          ('public.replace_interest_form(uuid, text, uuid)'),
          ('public.preview_interest_form_withdrawal(text)'),
          ('public.withdraw_interest_form(text, text)')
        ) as f(name)
       where r.rolname in ('anon', 'authenticated')
         and has_function_privilege(r.rolname, f.name, 'execute')`)
  ).rows.map((r) => r.grant);

  const reason = (r) => (r.ok ? "ok" : r.reason);
  const checks = [
    {
      name: "the withdraw link shows only the chapter, and refuses an unknown scope",
      got: [
        previewPat,
        previewLone.at_school,
        reason(badScope),
        reason(expired),
      ],
      want: [
        { ok: true, at_school: true, chapter_name: "Form Alpha" },
        false,
        "bad_scope",
        "bad_token",
      ],
    },
    {
      name: "withdrawing from one chapter closes its candidate, drops its answers, spends the link, and leaves the rest",
      got: [reason(patOut), reason(patAgain), afterPat],
      want: [
        "ok",
        "bad_token",
        {
          a_candidate: "closed:withdrew",
          a_withdrawn: true,
          a_answers: 0,
          b_answers: 1,
          pnm: 1,
        },
      ],
    },
    {
      name: "deleting everywhere removes the record and every answer; the candidate is a closed, unlinked Withdrawn prospect",
      got: [reason(boGone), afterBo, reason(loneGone), afterLone],
      want: [
        "ok",
        {
          pnm: 0,
          answers: 0,
          candidate: "Withdrawn prospect:closed:deleted_info:true",
        },
        "ok",
        { answers: 0, candidate: "Withdrawn prospect:deleted_info" },
      ],
    },
    {
      name: "an expired withdraw link does nothing",
      got: reason(expiredReal.r),
      want: "bad_token",
    },
    {
      name: "the ceilings hold: a resend cooldown, per address (any case), per IP, and five tries a code",
      got: [
        reason(firstOfTwo),
        reason(cooldown),
        reason(addressCap),
        reason(ipCap),
        reason(exhausted),
        reason(afterExhausted),
      ],
      want: [
        "ok",
        "cooldown",
        "address_limit",
        "ip_limit",
        "too_many_attempts",
        "too_many_attempts",
      ],
    },
    {
      name: "a code or proof from one chapter's form does nothing on another's",
      got: [reason(crossConfirm), reason(crossSubmit)],
      want: ["no_code", "bad_proof"],
    },
    {
      name: "a phone given on one chapter's form is never shared school-wide",
      got: phoneKept,
      want: { phone: "5550001111", phone_shared: false },
    },
    {
      name: "replacing a form keeps it open with its labels, and the old slug stops taking codes",
      got: [replaced.slug, replaced.is_open, afterReplace, reason(oldSlug)],
      want: [
        "formtiera9",
        true,
        { live: 1, old_open: false, labels: 1 },
        "form_closed",
      ],
    },
    {
      name: "one live form per chapter",
      got: /duplicate key/.test(secondLive),
      want: true,
    },
    {
      name: "a code goes only to the school's domains, an open form, and never an NPHC chapter",
      got: [
        reason(offDomain),
        reason(nphc),
        reason(closed),
        reason(lone),
        reason(sent),
      ],
      want: ["wrong_domain", "form_closed", "form_closed", "ok", "ok"],
    },
    {
      name: "a wrong code counts a try; the right one mints the proof",
      got: [reason(wrong), wrong.attempts_left, reason(right), right.email],
      want: ["wrong_code", 4, "ok", "pat@fts-tier.edu"],
    },
    {
      name: "the submission needs the proof, and spends it once",
      got: [reason(noProof), reason(first), reason(spent)],
      want: ["bad_proof", "ok", "bad_proof"],
    },
    {
      name: "one transaction: PNM, interest, first-stage candidate with pnm_id, push-up, consent",
      got: [
        first.candidate_created,
        first.pushed_up,
        first.council_id === IFC,
        afterFirst,
      ],
      want: [
        true,
        true,
        true,
        {
          pnms: 1,
          interests: 1,
          interest_label: "tabling-quad",
          registrations: 1,
          candidates: 1,
          candidate: "new:pnm:true:true",
          consent: "2026-11-24:agree_18:tabling-quad:true",
        },
      ],
    },
    {
      name: "a repeat submission updates, never duplicates",
      got: [
        reason(again),
        again.candidate_created,
        again.candidate_id === first.candidate_id,
        afterAgain,
      ],
      want: [
        "ok",
        false,
        true,
        { pnms: 1, candidates: 1, name: "Patrick Doe", submissions: 2 },
      ],
    },
    {
      name: "two PNMs may share a name; a hand-added name may not; a namesake is offered, never linked",
      got: [
        /duplicate key/.test(manualTwin),
        /created_by_manual/.test(noAdder),
        reason(jordan2),
        names,
      ],
      want: [
        true,
        true,
        "ok",
        { jordans: 3, offered_links: 2, linked_manual: 0, nobody_referred: 0 },
      ],
    },
    {
      name: "a pending council link feeds only the chapter; accepting it pushes up once, emailing only the newly listed",
      got: [
        pending.pushed_up,
        beforeAccept.n,
        pushed.pushed.map((p) => p.email),
        pushedAgain.pushed.length,
        afterAccept.n,
      ],
      want: [false, 0, ["bo@fts-tier.edu"], 0, 2],
    },
    {
      name: "a chapter with no school matches its own submissions, with no school-wide record",
      got: [
        loneFirst.pnm_id,
        loneAgain.candidate_id === loneFirst.candidate_id,
        loneRows,
      ],
      want: [null, true, { candidates: 1, unlinked: 1, interests: 0 }],
    },
    {
      name: "every new table has RLS on and no policy",
      got:
        posture.every((r) => r.relrowsecurity && r.policies === 0) &&
        posture.length === 4,
      want: true,
    },
    {
      name: "no new function is callable by anon or authenticated",
      got: callable,
      want: [],
    },
  ];
  for (const { name, got, want } of checks) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) miss();
    console.log(
      `${ok ? "OK   " : "MISS "} ${name}${ok ? "" : `\n        ↳ got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`,
    );
  }

  await db.query(
    `delete from interest_form_submissions where chapter_id = any($1)`,
    [[CH_A, CH_B, CH_LONE]],
  );
  await db.query(`delete from rush_candidates where chapter_id = any($1)`, [
    [CH_A, CH_B, CH_LONE],
  ]);
  await db.query(`delete from pnms where school_id = $1`, [SCHOOL]);
  await db.query(`delete from chapters where id = any($1)`, [
    [CH_A, CH_B, CH_NPHC, CH_LONE, IFC],
  ]);
  await db.query(`delete from users where id = any($1)`, [
    [USER, REFERRER, NAMESAKE],
  ]);
  await db.query(`delete from school_email_domains where school_id = $1`, [
    SCHOOL,
  ]);
  await db.query(`delete from schools where id = $1`, [SCHOOL]);
} catch (e) {
  miss();
  console.log(
    `ERR   interest forms tier\n        ↳ ${String(e?.message ?? e).split("\n")[0]}`,
  );
}
