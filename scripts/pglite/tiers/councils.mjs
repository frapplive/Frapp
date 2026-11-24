import { db, miss } from "../harness.mjs";

// ─── Functional: councils (20261124010605, #5933) ───────────────────────────
//
// What the database holds about a council, proven here:
//
//   - a council needs its type, a model its type allows, its school and the
//     `council` archetype marker, and a chapter may carry none of them
//     (`chapters_council_fields_kind`);
//   - one council of a type per school, `other` aside, even for two writers
//     (`chapters_one_council_per_type`); the same type at another school is
//     fine;
//   - `custom_access_token_hook` defaults the claim to a person's one
//     chapter, counting chapter-kind memberships only: a council beside it
//     changes nothing, a council alone is never the default, and a council
//     the person chose stays their claim (#5925's review);
//   - existing chapters keep `kind = 'chapter'` with every council field null.
//
// The rows are deleted at the end.
console.log("\n=== Functional: councils (20261124010605) ===");
try {
  const SCHOOL = "c5933000-0000-4000-8000-0000000000a1";
  const SCHOOL_2 = "c5933000-0000-4000-8000-0000000000a2";
  const CHAPTER = "c5933000-0000-4000-8000-0000000000c1";
  const IFC = "c5933000-0000-4000-8000-0000000000c2";
  const OTHER_1 = "c5933000-0000-4000-8000-0000000000c3";
  const OTHER_2 = "c5933000-0000-4000-8000-0000000000c4";
  const IFC_2 = "c5933000-0000-4000-8000-0000000000c5";
  const USER = "c5933000-0000-4000-8000-0000000000e1";
  const AUTH = "c5933000-0000-4000-8000-0000000000f1";

  const fails = async (sql) => {
    try {
      await db.exec(sql);
      return "succeeded";
    } catch (e) {
      return String(e?.message ?? e).split("\n")[0];
    }
  };
  const council = (id, type, model, school = SCHOOL) =>
    `insert into chapters (id, name, university, kind, council_type,
                           recruitment_model, council_school_id, org_archetype)
     values ('${id}', 'Council ${id.slice(-2)}', 'Tier School', 'council',
             '${type}', '${model}', '${school}', 'council')`;

  await db.exec(`
    insert into schools (id, name, short_name) values
      ('${SCHOOL}', 'Council Tier School', 'CTS'),
      ('${SCHOOL_2}', 'Council Tier School Two', 'CTS2');
    insert into chapters (id, name, university) values
      ('${CHAPTER}', 'Council Tier Chapter', 'Tier School');
    insert into users (id, supabase_auth_id, email) values
      ('${USER}', '${AUTH}', 'council-tier@example.com');
  `);

  const okIfc = await fails(council(IFC, "ifc", "open_bidding"));
  const secondIfc = await fails(
    council("c5933000-0000-4000-8000-0000000000c9", "ifc", "none"),
  );
  const ifcElsewhere = await fails(
    council(IFC_2, "ifc", "open_bidding", SCHOOL_2),
  );
  const otherOne = await fails(council(OTHER_1, "other", "none"));
  const otherTwo = await fails(council(OTHER_2, "other", "open_bidding"));

  const ifcFormal = await fails(
    council("c5933000-0000-4000-8000-0000000000d1", "ifc", "formal", SCHOOL_2),
  );
  const nphcBidding = await fails(
    council("c5933000-0000-4000-8000-0000000000d2", "nphc", "open_bidding"),
  );
  const noSchool = await fails(`
    insert into chapters (id, name, university, kind, council_type,
                          recruitment_model, org_archetype)
    values ('c5933000-0000-4000-8000-0000000000d3', 'x', 'x', 'council',
            'mgc', 'none', 'council')`);
  const chapterArchetype = await fails(`
    insert into chapters (id, name, university, kind, council_type,
                          recruitment_model, council_school_id, org_archetype)
    values ('c5933000-0000-4000-8000-0000000000d4', 'x', 'x', 'council',
            'mgc', 'none', '${SCHOOL}', 'ifc')`);
  const chapterWithType = await fails(
    `update chapters set council_type = 'ifc' where id = '${CHAPTER}'`,
  );
  const chapterAsCouncil = await fails(
    `update chapters set org_archetype = 'council' where id = '${CHAPTER}'`,
  );
  const chapterVerified = await fails(
    `update chapters set council_verified_at = now() where id = '${CHAPTER}'`,
  );

  const claim = async () => {
    const event = { user_id: AUTH, claims: { sub: AUTH } };
    const { rows } = await db.query(
      `select public.custom_access_token_hook($1::jsonb) as e`,
      [JSON.stringify(event)],
    );
    return rows[0].e.claims.active_chapter_id ?? null;
  };
  const join = (id, chapterId) =>
    db.exec(
      `insert into members (id, user_id, chapter_id, role_ids)
       values ('${id}', '${USER}', '${chapterId}', '{}')`,
    );

  // A council alone is never the default.
  await join("c5933000-0000-4000-8000-0000000000b1", IFC);
  const councilOnly = await claim();
  // One chapter and one council: the chapter.
  await join("c5933000-0000-4000-8000-0000000000b2", CHAPTER);
  const chapterAndCouncil = await claim();
  // A council the person chose stays the claim.
  await db.exec(`update users set active_chapter_id = '${IFC}' where id = '${USER}'`);
  const chosenCouncil = await claim();

  const stillChapters = (
    await db.query(
      `select count(*)::int as n from chapters
        where id not in ($1, $2, $3, $4, $5)
          and (kind <> 'chapter' or council_type is not null
               or recruitment_model is not null or council_school_id is not null)`,
      [IFC, OTHER_1, OTHER_2, IFC_2, CHAPTER],
    )
  ).rows[0].n;

  const checks = [
    { name: "a well-formed IFC council is accepted", got: okIfc, want: "succeeded" },
    {
      name: "a second IFC at the same school is refused (chapters_one_council_per_type)",
      got: /chapters_one_council_per_type/.test(secondIfc),
      want: true,
    },
    { name: "an IFC at another school is accepted", got: ifcElsewhere, want: "succeeded" },
    {
      name: "a school may have several `other` councils",
      got: [otherOne, otherTwo],
      want: ["succeeded", "succeeded"],
    },
    {
      name: "an IFC refuses the formal model",
      got: /chapters_council_fields_kind/.test(ifcFormal),
      want: true,
    },
    {
      name: "an NPHC council refuses open bidding",
      got: /chapters_council_fields_kind/.test(nphcBidding),
      want: true,
    },
    {
      name: "a council needs its school",
      got: /chapters_council_fields_kind/.test(noSchool),
      want: true,
    },
    {
      name: "a council needs the council archetype marker",
      got: /chapters_council_fields_kind/.test(chapterArchetype),
      want: true,
    },
    {
      name: "a chapter refuses a council type, the council archetype and verification",
      got: [chapterWithType, chapterAsCouncil, chapterVerified].map((m) =>
        /chapters_council_fields_kind/.test(m),
      ),
      want: [true, true, true],
    },
    {
      name: "the token hook never defaults to a person's only council",
      got: councilOnly,
      want: null,
    },
    {
      name: "the token hook defaults to the one chapter beside a council",
      got: chapterAndCouncil,
      want: CHAPTER,
    },
    {
      name: "the token hook keeps a council the person chose",
      got: chosenCouncil,
      want: IFC,
    },
    {
      name: "every other chapter is kind chapter with no council field",
      got: stillChapters,
      want: 0,
    },
  ];
  for (const { name, got, want } of checks) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) miss();
    console.log(
      `${ok ? "OK   " : "MISS "} ${name}${ok ? "" : `\n        ↳ got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`,
    );
  }

  await db.exec(`
    delete from members where user_id = '${USER}';
    delete from users where id = '${USER}';
    delete from chapters where id in ('${CHAPTER}', '${IFC}', '${OTHER_1}', '${OTHER_2}', '${IFC_2}');
    delete from schools where id in ('${SCHOOL}', '${SCHOOL_2}');
  `);
} catch (e) {
  miss();
  console.log(`ERR   councils tier\n        ↳ ${String(e?.message ?? e).split("\n")[0]}`);
}
