import { db, miss } from "../harness.mjs";

// ─── Functional: tenant slugs and kind (20261123194106, ADR-27, #5918) ──────
//
// The slug registry's rules live in the database, so they are proven here:
//
//   - every chapter gets exactly one current slug from the insert trigger,
//     the oldest keeping the plain default and a later collision a number;
//   - a reserved word is never assigned, even when it is the default;
//   - the format CHECK refuses what `TENANT_SLUG_PATTERN` refuses;
//   - a second current slug for one tenant is refused;
//   - another tenant can never take a slug, current or retired (ADR-27
//     cross-tenant test 7, database half);
//   - a tenant can take back its own retired slug;
//   - no UPDATE (or upsert) renames a slug or moves it to another tenant,
//     and a deleted tenant's slugs stay, ownerless;
//   - the backfill gives every chapter without a slug its default, oldest
//     first (no chapter exists when the migrations apply here, so the tier
//     runs it itself);
//   - `get_request_context` reports a council's kind as stored;
//   - `chapters.kind` defaults to `chapter` and refuses anything but
//     `chapter` and `council`;
//   - nobody but the owner and `service_role` may call the assigner.
//
// The rows are deleted at the end.
console.log("\n=== Functional: tenant slugs and kind (20261123194106) ===");
try {
  const A = "c5918000-0000-4000-8000-00000000000a";
  const B = "c5918000-0000-4000-8000-00000000000b";
  const C = "c5918000-0000-4000-8000-00000000000c";
  const D = "c5918000-0000-4000-8000-00000000000d";
  const E = "c5918000-0000-4000-8000-00000000000e";
  const F = "c5918000-0000-4000-8000-00000000000f";
  await db.exec(`
    insert into chapters (id, name, university, created_at) values
      ('${A}', 'Slug Tier', 'Tier U', now() - interval '2 days'),
      ('${B}', 'Slug Tier', 'Tier U', now() - interval '1 day'),
      ('${C}', 'Council', '', now());
    -- A council carries its own fields since 20261124010605 (#5933).
    insert into schools (id, name, short_name) values
      ('${D}', 'Slug Tier School', 'STS');
    insert into chapters (id, name, university, kind, council_type,
                          recruitment_model, council_school_id, org_archetype) values
      ('${D}', 'Tier Council', 'Tier U', 'council', 'other', 'none', '${D}', 'council');
  `);

  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const current = async (id) =>
    (
      await db.query(
        `select slug from tenant_slugs where chapter_id = $1 and retired_at is null`,
        [id],
      )
    ).rows.map((r) => r.slug);
  const fails = async (sql) => {
    try {
      await db.exec(sql);
      return "succeeded";
    } catch (e) {
      return String(e?.message ?? e).split("\n")[0];
    }
  };

  const slugA = await current(A);
  const slugB = await current(B);
  const slugC = await current(C);
  const kinds = (
    await db.query(
      `select id, kind from chapters where id in ($1, $2) order by id`,
      [A, D],
    )
  ).rows.map((r) => r.kind);

  const badFormat = await fails(
    `insert into tenant_slugs (slug, chapter_id) values ('Bad_Slug', null)`,
  );
  const secondCurrent = await fails(
    `insert into tenant_slugs (slug, chapter_id) values ('slug-tier-second', '${A}')`,
  );
  const badKind = await fails(
    `update chapters set kind = 'ifc' where id = '${A}'`,
  );

  // A renames: retires its slug and takes a new one.
  await db.exec(`
    update tenant_slugs set retired_at = now() where chapter_id = '${A}' and retired_at is null;
    insert into tenant_slugs (slug, chapter_id) values ('slug-tier-renamed', '${A}');
  `);
  const stealRetired = await fails(
    `update tenant_slugs set retired_at = now() where chapter_id = '${B}' and retired_at is null;
     insert into tenant_slugs (slug, chapter_id) values ('${slugA[0]}', '${B}');`,
  );
  // That statement pair runs as one implicit transaction in exec, so B's
  // retire rolled back with the failed insert.
  const stealCurrent = await fails(
    `insert into tenant_slugs (slug, chapter_id) values ('${slugB[0]}', '${D}')`,
  );
  // A takes its old slug back.
  const takeBack = await fails(`
    update tenant_slugs set retired_at = now() where chapter_id = '${A}' and retired_at is null;
    update tenant_slugs set retired_at = null where slug = '${slugA[0]}';
  `);
  const afterTakeBack = await current(A);

  // A retired slug (A's renamed one) can't be moved or upserted to B, and no
  // slug is renamed in place.
  const moveRetired = await fails(
    `update tenant_slugs set chapter_id = '${B}' where slug = 'slug-tier-renamed'`,
  );
  const upsertRetired = await fails(
    `insert into tenant_slugs (slug, chapter_id) values ('slug-tier-renamed', '${B}')
     on conflict (slug) do update set chapter_id = excluded.chapter_id, retired_at = null`,
  );
  const renameInPlace = await fails(
    `update tenant_slugs set slug = 'slug-tier-other' where slug = '${slugB[0]}'`,
  );

  // The council's kind comes back through the guard's one-call read.
  const councilKind = (
    await one(
      `select public.get_request_context(gen_random_uuid(), $1) as ctx`,
      [D],
    )
  )?.ctx?.chapter?.kind;

  // A deleted tenant's slug stays, with no owner.
  const slugD = await current(D);
  await db.exec(`delete from chapters where id = '${D}'`);
  await db.exec(`delete from schools where id = '${D}'`);
  const orphan = await one(
    `select chapter_id from tenant_slugs where slug = $1`,
    [slugD[0]],
  );

  // The backfill, on chapters inserted with the trigger off: F is older.
  await db.exec(`
    alter table chapters disable trigger chapters_assign_tenant_slug;
    insert into chapters (id, name, university, created_at) values
      ('${E}', 'Backfill Tier', 'BT U', now()),
      ('${F}', 'Backfill Tier', 'BT U', now() - interval '1 day');
    alter table chapters enable trigger chapters_assign_tenant_slug;
  `);
  const beforeBackfill = [...(await current(E)), ...(await current(F))];
  const assigned = (await one(`select public.backfill_tenant_slugs() as n`))?.n;
  const backfilled = [(await current(F))[0], (await current(E))[0]];
  const again = (await one(`select public.backfill_tenant_slugs() as n`))?.n;

  const privileges = (
    await db.query(
      `select r.rolname,
              has_function_privilege(r.rolname, 'public.assign_default_tenant_slug(uuid)', 'execute') as allowed
         from pg_roles r
        where r.rolname in ('anon', 'authenticated')
        order by r.rolname`,
    )
  ).rows;
  const reservedAssigned = await one(
    `select count(*)::int as n from tenant_slugs where public.is_reserved_tenant_slug(slug)`,
  );

  const SCENARIOS = [
    {
      name: "every chapter gets exactly one current slug on insert",
      got: JSON.stringify([slugA.length, slugB.length, slugC.length]),
      want: JSON.stringify([1, 1, 1]),
    },
    {
      name: "the older of two chapters with one default keeps it; the newer gets -2",
      got: JSON.stringify([slugA[0], slugB[0]]),
      want: JSON.stringify(["slug-tier-tier-u", "slug-tier-tier-u-2"]),
    },
    {
      name: "a reserved default ('council') is never assigned; it gets a number",
      got: slugC[0],
      want: "council-2",
    },
    {
      name: "no assigned slug anywhere is a reserved word",
      got: String(reservedAssigned?.n),
      want: "0",
    },
    {
      name: "kind defaults to chapter and keeps an explicit council",
      got: JSON.stringify(kinds),
      want: JSON.stringify(["chapter", "council"]),
    },
    {
      name: "a kind other than chapter or council is refused",
      got: /chapters_kind_check/.test(badKind) ? "refused" : badKind,
      want: "refused",
    },
    {
      name: "the format CHECK refuses an uppercase or underscored slug",
      got: /tenant_slugs_slug_format/.test(badFormat) ? "refused" : badFormat,
      want: "refused",
    },
    {
      name: "a second current slug for one tenant is refused",
      got: /tenant_slugs_one_current_per_tenant/.test(secondCurrent)
        ? "refused"
        : secondCurrent,
      want: "refused",
    },
    {
      name: "another tenant can't take a retired slug (ADR-27 test 7)",
      got: /tenant_slugs_pkey/.test(stealRetired) ? "refused" : stealRetired,
      want: "refused",
    },
    {
      name: "another tenant can't take a current slug",
      got: /tenant_slugs_pkey/.test(stealCurrent) ? "refused" : stealCurrent,
      want: "refused",
    },
    {
      name: "a tenant takes back its own retired slug (ADR-27 test 7)",
      got: JSON.stringify([takeBack, afterTakeBack]),
      want: JSON.stringify(["succeeded", [slugA[0]]]),
    },
    {
      name: "a retired slug can't be moved to another tenant by UPDATE",
      got: /never moves to another tenant/.test(moveRetired)
        ? "refused"
        : moveRetired,
      want: "refused",
    },
    {
      name: "a retired slug can't be moved to another tenant by upsert",
      got: /never moves to another tenant/.test(upsertRetired)
        ? "refused"
        : upsertRetired,
      want: "refused",
    },
    {
      name: "a slug is never renamed in place",
      got: /never renamed/.test(renameInPlace) ? "refused" : renameInPlace,
      want: "refused",
    },
    {
      name: "get_request_context reports a council's kind as stored",
      got: String(councilKind),
      want: "council",
    },
    {
      name: "a deleted tenant's slug stays in the table, ownerless",
      got: JSON.stringify(orphan),
      want: JSON.stringify({ chapter_id: null }),
    },
    {
      name: "the backfill gives slugless chapters their default, oldest first, once",
      got: JSON.stringify([beforeBackfill, assigned, backfilled, again]),
      want: JSON.stringify([
        [],
        2,
        ["backfill-tier-bt-u", "backfill-tier-bt-u-2"],
        0,
      ]),
    },
    {
      name: "anon and authenticated can't call the slug assigner",
      got: privileges
        .filter((p) => p.allowed)
        .map((p) => p.rolname)
        .join(","),
      want: "",
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
    delete from tenant_slugs where chapter_id in ('${A}', '${B}', '${C}', '${E}', '${F}')
      or slug = '${slugD[0]}';
    delete from chapters where id in ('${A}', '${B}', '${C}', '${E}', '${F}');
  `);
} catch (e) {
  miss();
  console.log(
    `MISS  tenant slugs (#5918)\n        ↳ ${String(e?.message ?? e).split("\n")[0]}`,
  );
}
