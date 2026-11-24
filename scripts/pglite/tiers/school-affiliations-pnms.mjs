import { db, miss } from "../harness.mjs";

// ─── Functional: affiliations and PNMs (20261124205834, #5974) ──────────────
//
// `spec/architecture/school-layer.md` § 2.4, § 2.5, § 3.5 and § 4.3's
// function-level list, proven here:
//
//   - a chapter officer confirms, declines or ends a school link, and a
//     second confirmed school is secondary;
//   - `set_council_chapter_status` (test 13) refuses a link of the wrong kind
//     or with no shared active school, holds the two-sided agreement (the
//     proposer can't accept its own proposal, only the council suspends),
//     and ending the chapter's school link ends its council link;
//   - one PNM per verified school email, whatever its case, across chapters;
//     an address off the school's domains is refused;
//   - `record_pnm_interest` refuses an unverified (imported) PNM, an
//     `nphc`-archetype chapter, a chapter not at the PNM's school, a council
//     whose model is `none` and a closed season;
//   - `merge_pnms` (Merge) moves registrations and interests without breaking
//     a unique index, repoints a chapter's candidate where it can and counts
//     where it can't, refuses two accounts and a second merge, and logs both
//     sides;
//   - `purge_expired_pnms` (Purge) deletes exactly the records past season
//     close plus N days, keeps the one a second short, and leaves the
//     chapter's candidate unlinked;
//   - account deletion deletes the person's PNM records;
//   - `council_pnm_access_log` refuses update and delete (Append-only);
//   - RLS on and no policy on every new table, and no function callable by
//     `anon` or `authenticated` (§ 4.1).
//
// The rows are deleted at the end.
console.log("\n=== Functional: affiliations and PNMs (20261124205834) ===");
try {
  const P = "c5974000-0000-4000-8000-0000000000";
  const SCHOOL = `${P}a1`;
  const SCHOOL_2 = `${P}a2`;
  const CH_A = `${P}c1`;
  const CH_B = `${P}c2`;
  const CH_NPHC = `${P}c3`;
  const CH_ELSEWHERE = `${P}c4`;
  const IFC = `${P}d1`;
  const NONE_COUNCIL = `${P}d2`;
  const IFC_2 = `${P}d3`;
  const USER = `${P}e1`;
  const USER_2 = `${P}e2`;

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
    `insert into schools (id, name, short_name) values
       ($1, 'Affiliation Tier School', 'ATS'), ($2, 'Affiliation Tier Two', 'AT2')`,
    [SCHOOL, SCHOOL_2],
  );
  await db.query(
    `insert into school_email_domains (school_id, domain, status, verified_via) values
       ($1, 'ats-tier.edu', 'verified', 'staff'), ($2, 'at2-tier.edu', 'verified', 'staff')`,
    [SCHOOL, SCHOOL_2],
  );
  await db.query(
    `insert into users (id, email, display_name, supabase_auth_id) values
       ($1, 'aff-tier-1@example.com', 'Aff One', gen_random_uuid()),
       ($2, 'aff-tier-2@example.com', 'Aff Two', gen_random_uuid())`,
    [USER, USER_2],
  );
  await db.query(
    `insert into chapters (id, name, university, org_archetype) values
       ($1, 'Tier Alpha', 'ATS', 'ifc'), ($2, 'Tier Beta', 'ATS', 'ifc'),
       ($3, 'Tier Nphc', 'ATS', 'nphc'), ($4, 'Tier Elsewhere', 'AT2', 'ifc')`,
    [CH_A, CH_B, CH_NPHC, CH_ELSEWHERE],
  );
  await db.query(
    `insert into chapters (id, name, university, kind, council_type, recruitment_model,
                           council_school_id, org_archetype) values
       ($1, 'Tier IFC', 'ATS', 'council', 'ifc', 'open_bidding', $3, 'council'),
       ($2, 'Tier Other', 'ATS', 'council', 'other', 'none', $3, 'council'),
       ($4, 'Tier IFC Two', 'AT2', 'council', 'ifc', 'open_bidding', $5, 'council')`,
    [IFC, NONE_COUNCIL, SCHOOL, IFC_2, SCHOOL_2],
  );

  // ── School links ──
  const propose = (school, chapter) =>
    one(
      `insert into school_chapters (school_id, chapter_id, proposed_by)
       values ($1, $2, $3) returning id`,
      [school, chapter, USER],
    );
  const schoolStatus = (link, chapter, status) =>
    fn(`select public.set_school_chapter_status($1, $2, $3, $4)`, [
      link,
      chapter,
      status,
      USER,
    ]);
  const linkA = (await propose(SCHOOL, CH_A)).id;
  const linkB = (await propose(SCHOOL, CH_B)).id;
  const linkNphc = (await propose(SCHOOL, CH_NPHC)).id;
  const linkElsewhere = (await propose(SCHOOL_2, CH_ELSEWHERE)).id;
  const linkA2 = (await propose(SCHOOL_2, CH_A)).id;
  const wrongChapter = await schoolStatus(linkA, CH_B, "active");
  const confirmA = await schoolStatus(linkA, CH_A, "active");
  const confirmA2 = await schoolStatus(linkA2, CH_A, "active");
  const reconfirm = await schoolStatus(linkA, CH_A, "active");
  await schoolStatus(linkB, CH_B, "active");
  await schoolStatus(linkNphc, CH_NPHC, "active");
  await schoolStatus(linkElsewhere, CH_ELSEWHERE, "active");

  // ── Council links ──
  const link = (council, chapter, side, status, linkId = null) =>
    fn(`select public.set_council_chapter_status($1, $2, $3, $4, $5, $6)`, [
      council,
      chapter,
      side,
      status,
      USER,
      linkId,
    ]);
  const councilToCouncil = await link(IFC, IFC_2, "council", "proposed");
  const noSharedSchool = await link(IFC, CH_ELSEWHERE, "council", "proposed");
  const proposed = await link(IFC, CH_A, "council", "proposed");
  const again = await link(IFC, CH_A, "chapter", "proposed");
  const selfAccept = await link(IFC, CH_A, "council", "accepted");
  const accepted = await link(IFC, CH_A, "chapter", "accepted");
  const chapterSuspends = await link(IFC, CH_A, "chapter", "suspended");
  const suspended = await link(IFC, CH_A, "council", "suspended");
  const reinstated = await link(IFC, CH_A, "council", "accepted");
  const askB = await link(IFC, CH_B, "chapter", "proposed");
  const declineB = await link(IFC, CH_B, "council", "declined");
  const askBAgain = await link(IFC, CH_B, "chapter", "proposed");
  // A stale page still showing the declined link can't decide the new one.
  const staleLink = await link(IFC, CH_B, "council", "accepted", declineB.link.id);
  await link(IFC, CH_B, "council", "accepted", askBAgain.link.id);
  await link(IFC, CH_NPHC, "chapter", "proposed");
  await link(IFC, CH_NPHC, "council", "accepted");
  await link(NONE_COUNCIL, CH_A, "council", "proposed");
  await link(NONE_COUNCIL, CH_A, "chapter", "accepted");
  await link(IFC_2, CH_ELSEWHERE, "council", "proposed");
  await link(IFC_2, CH_ELSEWHERE, "chapter", "accepted");

  // ── PNMs ──
  const upsert = (school, email, first = "Pat", phone = null, user = null) =>
    fn(
      `select public.upsert_verified_pnm($1, $2, $3, 'Tier', null, 2030::smallint,
                                         $4, true, 'interest_form', $5)`,
      [school, email, first, phone, user],
    );
  const first = await upsert(SCHOOL, "pat@ats-tier.edu", "Pat", null, USER);
  const second = await upsert(SCHOOL, "  PAT@ATS-TIER.EDU ", "Patrick", "5550001111");
  const offDomain = await upsert(SCHOOL, "pat@gmail.com");
  const pnm = first.pnm_id;
  const pnmRow = await one(`select first_name, phone, user_id from pnms where id = $1`, [pnm]);

  await db.query(
    `insert into council_recruitment_seasons (council_id, term, opens_at, closes_at, status)
     values ($1, 'Spring 2027', now() - interval '1 day', now() + interval '30 days', 'open'),
            ($1, 'Fall 2026', now() - interval '90 days', now() - interval '60 days', 'closed'),
            ($2, 'Spring 2027', now() - interval '1 day', now() + interval '30 days', 'open')`,
    [IFC, NONE_COUNCIL],
  );
  const interest = (pnmId, chapter, council = null, term = null) =>
    fn(
      `select public.record_pnm_interest($1, $2, 'interest_form', 'tabling-quad', $3, $4)`,
      [pnmId, chapter, council, term],
    );
  const intA = await interest(pnm, CH_A, IFC, "Spring 2027");
  const intB = await interest(pnm, CH_B);
  const intAAgain = await interest(pnm, CH_A);
  const nphc = await interest(pnm, CH_NPHC);
  const elsewhere = await interest(pnm, CH_ELSEWHERE);
  const noneModel = await interest(pnm, CH_A, NONE_COUNCIL, "Spring 2027");
  const closedSeason = await interest(pnm, CH_A, IFC, "Fall 2026");
  const imported = await one(
    `insert into pnms (school_id, school_email, first_name, last_name, created_via)
     values ($1, 'imported@ats-tier.edu', 'Imp', 'Orted', 'council_import') returning id`,
    [SCHOOL],
  );
  const unverified = await interest(imported.id, CH_A);
  const pnmCounts = await one(
    `select (select count(*)::int from pnms where school_id = $1 and school_email = 'pat@ats-tier.edu') as pnms,
            (select count(*)::int from pnm_interests where pnm_id = $2) as interests,
            (select count(*)::int from pnm_council_registrations where pnm_id = $2) as registrations`,
    [SCHOOL, pnm],
  );

  // ── Merge ──
  const dupe = (await upsert(SCHOOL, "pat.t@ats-tier.edu", "Pat", "5550001111")).pnm_id;
  await interest(dupe, CH_A, IFC, "Spring 2027");
  await interest(dupe, CH_B);
  // Chapter A has a candidate for each record; chapter B only for the dupe.
  await db.query(
    `insert into rush_candidates (chapter_id, display_name, created_by, pnm_id, origin) values
       ($1, 'Pat Tier', $4, $2, 'pnm'),
       ($1, 'Pat T', $4, $3, 'pnm'),
       ($5, 'Pat T', $4, $3, 'pnm')`,
    [CH_A, pnm, dupe, USER, CH_B],
  );
  const handAdded = await one(
    `insert into rush_candidates (chapter_id, display_name, created_by)
     values ($1, 'Pat Tier', $2) returning pnm_id, origin`,
    [CH_B, USER],
  );
  const otherAccount = (await upsert(SCHOOL, "other@ats-tier.edu", "Pat", null, USER_2)).pnm_id;
  await interest(otherAccount, CH_A, IFC, "Spring 2027");
  const twoAccounts = await fn(`select public.merge_pnms($1, $2, $3, $4)`, [
    IFC,
    pnm,
    otherAccount,
    USER,
  ]);
  const wrongCouncil = await fn(`select public.merge_pnms($1, $2, $3, $4)`, [
    IFC_2,
    pnm,
    dupe,
    USER,
  ]);
  const merged = await fn(`select public.merge_pnms($1, $2, $3, $4)`, [IFC, pnm, dupe, USER]);
  const mergeAgain = await fn(`select public.merge_pnms($1, $2, $3, $4)`, [IFC, pnm, dupe, USER]);
  const afterMerge = await one(
    `select (select merged_into_id from pnms where id = $2) as merged_into,
            (select count(*)::int from pnm_interests where pnm_id = $1) as interests,
            (select count(*)::int from pnm_interests where pnm_id = $2) as loser_interests,
            (select count(*)::int from pnm_council_registrations where pnm_id = $1) as registrations,
            (select count(*)::int from rush_candidates where pnm_id = $1) as candidates,
            (select count(*)::int from rush_candidates where pnm_id = $2) as left_on_loser,
            (select count(*)::int from pnm_merges where survivor_id = $1 and loser_id = $2
               and loser_before->>'school_email' = 'pat.t@ats-tier.edu') as logged`,
    [pnm, dupe],
  );
  const viaLoser = await interest(dupe, CH_B);
  // The merged-away address is the survivor's person: it finds the survivor.
  const mergedAddress = await upsert(SCHOOL, "pat.t@ats-tier.edu", "Pat");

  // A merge keeps a live interest over a withdrawn one.
  const keepS = (await upsert(SCHOOL, "keep-s@ats-tier.edu", "Kim")).pnm_id;
  const keepL = (await upsert(SCHOOL, "keep-l@ats-tier.edu", "Kim")).pnm_id;
  await interest(keepS, CH_A, IFC, "Spring 2027");
  await interest(keepL, CH_A, IFC, "Spring 2027");
  await db.query(
    `update pnm_interests set withdrawn_at = now() where pnm_id = $1`,
    [keepS],
  );
  await fn(`select public.merge_pnms($1, $2, $3, $4)`, [IFC, keepS, keepL, USER]);
  const keptLive = await one(
    `select count(*)::int as n from pnm_interests
      where pnm_id = $1 and chapter_id = $2 and withdrawn_at is null`,
    [keepS, CH_A],
  );

  // ── Append-only log ──
  await db.query(
    `insert into council_pnm_access_log (council_id, actor_user_id, pnm_id, fields)
     values ($1, $2, $3, '{phone}')`,
    [IFC, USER, pnm],
  );
  const logUpdate = await fails(`update council_pnm_access_log set fields = '{}'`);
  const logDelete = await fails(`delete from council_pnm_access_log`);

  // ── Ending a school link ends the council link ──
  const endedSchool = await schoolStatus(linkB, CH_B, "ended");
  const bCouncil = await one(
    `select status from council_chapters where council_id = $1 and chapter_id = $2
      order by created_at desc limit 1`,
    [IFC, CH_B],
  );

  // ── Purge ──
  const purgeNow = await one(`select now() as t`);
  await db.query(
    `insert into council_recruitment_seasons (council_id, term, opens_at, closes_at, status, pnm_retention_days)
     values ($1, 'Fall 2025', $2::timestamptz - interval '400 days', $2::timestamptz - interval '180 days' - interval '1 second', 'closed', 180),
            ($1, 'Spring 2026', $2::timestamptz - interval '400 days', $2::timestamptz - interval '180 days' + interval '1 second', 'closed', 180)`,
    [IFC, purgeNow.t],
  );
  const expired = (await upsert(SCHOOL, "expired@ats-tier.edu")).pnm_id;
  const keptShort = (await upsert(SCHOOL, "kept@ats-tier.edu")).pnm_id;
  const stale = (await upsert(SCHOOL, "stale@ats-tier.edu")).pnm_id;
  const returning = (await upsert(SCHOOL, "returning@ats-tier.edu")).pnm_id;
  await db.query(
    `insert into pnm_council_registrations (pnm_id, council_id, term) values
       ($1, $3, 'Fall 2025'), ($2, $3, 'Spring 2026'), ($4, $3, 'Fall 2025')`,
    [expired, keptShort, IFC, returning],
  );
  // Back after their season expired: a fresh interest keeps them.
  await db.query(
    `insert into pnm_interests (pnm_id, chapter_id, source, created_at)
     values ($1, $2, 'interest_form', now() - interval '1 day')`,
    [returning, CH_A],
  );
  await db.query(
    `insert into rush_candidates (chapter_id, display_name, created_by, pnm_id, origin)
     values ($1, 'Expired Pnm', $2, $3, 'pnm')`,
    [CH_A, USER, expired],
  );
  await db.query(`update pnms set updated_at = now() - interval '181 days' where id = $1`, [stale]);
  const purged = await fn(`select public.purge_expired_pnms($1)`, [purgeNow.t]);
  const afterPurge = await one(
    `select (select count(*)::int from pnms where id = $1) as expired,
            (select count(*)::int from pnms where id = $2) as kept,
            (select count(*)::int from pnms where id = $3) as stale,
            (select count(*)::int from pnms where id = $4) as live,
            (select count(*)::int from pnms where id = $6) as returning,
            (select count(*)::int from rush_candidates
              where chapter_id = $5 and display_name = 'Expired Pnm' and pnm_id is null) as unlinked`,
    [expired, keptShort, stale, pnm, CH_A, returning],
  );

  // ── Account deletion ──
  await db.query(`update users set deleted_at = now() where id = $1`, [USER]);
  const afterDeletion = await one(
    `select (select count(*)::int from pnms where id = $1) as pnm,
            (select count(*)::int from pnms where id = $2) as merged,
            (select count(*)::int from rush_candidates where pnm_id is not null and chapter_id = $3) as linked`,
    [pnm, dupe, CH_A],
  );

  // ── Posture ──
  const posture = (
    await db.query(`
      select c.relname, c.relrowsecurity,
             (select count(*)::int from pg_policies p
               where p.schemaname = 'public' and p.tablename = c.relname) as policies
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname in ('council_chapters', 'pnms', 'council_recruitment_seasons',
                           'pnm_council_registrations', 'pnm_interests', 'pnm_merges',
                           'pnm_duplicate_dismissals', 'council_pnm_access_log')
       order by c.relname`)
  ).rows;
  const callable = (
    await db.query(`
      select r.rolname || ':' || f.name as grant
        from pg_roles r
        cross join (values
          ('public.set_school_chapter_status(uuid, uuid, text, uuid)'),
          ('public.set_council_chapter_status(uuid, uuid, text, text, uuid, uuid)'),
          ('public.upsert_verified_pnm(uuid, text, text, text, text, smallint, text, boolean, text, uuid)'),
          ('public.record_pnm_interest(uuid, uuid, text, text, uuid, text)'),
          ('public.merge_pnms(uuid, uuid, uuid, uuid)'),
          ('public.delete_pnm(uuid)'),
          ('public.purge_expired_pnms(timestamptz)')
        ) as f(name)
       where r.rolname in ('anon', 'authenticated')
         and has_function_privilege(r.rolname, f.name, 'execute')`)
  ).rows.map((r) => r.grant);

  const reason = (r) => (r.ok ? "ok" : r.reason);
  const checks = [
    {
      name: "a chapter officer confirms a school link; a second school is secondary",
      got: [reason(wrongChapter), reason(confirmA), confirmA.link?.is_primary,
            reason(confirmA2), confirmA2.link?.is_primary, reason(reconfirm)],
      want: ["not_found", "ok", true, "ok", false, "invalid_transition"],
    },
    {
      name: "set_council_chapter_status refuses the wrong kind and no shared school (test 13)",
      got: [reason(councilToCouncil), reason(noSharedSchool)],
      want: ["wrong_kind", "no_shared_school"],
    },
    {
      name: "both sides agree: one live link, the proposer can't accept, the other side does",
      got: [reason(proposed), reason(again), reason(selfAccept), reason(accepted)],
      want: ["ok", "exists", "invalid_transition", "ok"],
    },
    {
      name: "only the council suspends, and it lifts its own suspension",
      got: [reason(chapterSuspends), reason(suspended), reason(reinstated), reinstated.link?.status],
      want: ["invalid_transition", "ok", "ok", "accepted"],
    },
    {
      name: "the council declines a chapter's request, and the chapter may ask again",
      got: [reason(askB), reason(declineB), declineB.link?.status],
      want: ["ok", "ok", "declined"],
    },
    {
      name: "a step naming a link that isn't the pair's live one is refused",
      got: [reason(askBAgain), reason(staleLink)],
      want: ["ok", "invalid_transition"],
    },
    {
      name: "a merged-away address finds its survivor; a merge keeps a live interest",
      got: [mergedAddress.pnm_id === pnm, mergedAddress.created, keptLive.n],
      want: [true, false, 1],
    },
    {
      name: "ending a chapter's school link ends its council link there",
      got: [reason(endedSchool), bCouncil.status],
      want: ["ok", "ended"],
    },
    {
      name: "one PNM per verified school email, whatever its case; details refresh",
      got: [first.created, second.created, second.pnm_id === pnm, pnmRow.first_name,
            pnmRow.phone, pnmRow.user_id === USER, reason(offDomain)],
      want: [true, false, true, "Patrick", "5550001111", true, "wrong_domain"],
    },
    {
      name: "interest from two chapters is one PNM with two interests and one registration",
      got: [reason(intA), reason(intB), reason(intAAgain), pnmCounts],
      want: ["ok", "ok", "ok", { pnms: 1, interests: 2, registrations: 1 }],
    },
    {
      name: "record_pnm_interest refuses nphc, another school, model none, a closed season, unverified",
      got: [reason(nphc), reason(elsewhere), reason(noneModel), reason(closedSeason), reason(unverified)],
      want: ["chapter_refuses", "not_at_school", "council_model_none", "season_closed", "unverified"],
    },
    {
      name: "a hand-added candidate is manual with no PNM link (D7)",
      got: handAdded,
      want: { pnm_id: null, origin: "manual" },
    },
    {
      name: "merge_pnms refuses two accounts, another council's merge and a second merge",
      got: [reason(twoAccounts), reason(wrongCouncil), reason(mergeAgain)],
      want: ["two_accounts", "not_found", "already_merged"],
    },
    {
      name: "merge_pnms unions interests, repoints candidates where it can, and logs both sides",
      got: [reason(merged), merged.candidate_conflicts, afterMerge],
      want: ["ok", 1, {
        merged_into: pnm, interests: 2, loser_interests: 0, registrations: 1,
        candidates: 2, left_on_loser: 1, logged: 1,
      }],
    },
    {
      name: "an interest sent to a merged record lands on the survivor",
      got: [reason(viaLoser), viaLoser.pnm_id === pnm],
      want: ["ok", true],
    },
    {
      name: "council_pnm_access_log refuses update and delete",
      got: [/append-only/.test(logUpdate), /append-only/.test(logDelete)],
      want: [true, true],
    },
    {
      name: "purge_expired_pnms deletes past close plus N days, keeps a second short, unlinks the candidate",
      got: [purged >= 2, afterPurge],
      want: [true, { expired: 0, kept: 1, stale: 0, live: 1, returning: 1, unlinked: 1 }],
    },
    {
      name: "account deletion deletes the person's PNM records and leaves candidates unlinked",
      got: afterDeletion,
      want: { pnm: 0, merged: 0, linked: 0 },
    },
    {
      name: "every new table has RLS on and no policy (§ 4.1)",
      got: posture.every((r) => r.relrowsecurity && r.policies === 0) && posture.length === 8,
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

  await db.query(`delete from rush_candidates where chapter_id in ($1, $2)`, [CH_A, CH_B]);
  await db.query(`delete from pnms where school_id in ($1, $2)`, [SCHOOL, SCHOOL_2]);
  await db.query(`delete from chapters where id in ($1, $2, $3, $4, $5, $6, $7)`, [
    CH_A, CH_B, CH_NPHC, CH_ELSEWHERE, IFC, NONE_COUNCIL, IFC_2,
  ]);
  await db.query(`delete from users where id in ($1, $2)`, [USER, USER_2]);
  await db.query(`delete from school_email_domains where school_id in ($1, $2)`, [SCHOOL, SCHOOL_2]);
  await db.query(`delete from schools where id in ($1, $2)`, [SCHOOL, SCHOOL_2]);
} catch (e) {
  miss();
  console.log(`ERR   affiliations and PNMs tier\n        ↳ ${String(e?.message ?? e).split("\n")[0]}`);
}
