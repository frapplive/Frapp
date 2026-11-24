import { db, miss } from "../harness.mjs";

// ─── Functional: school layer 1 (20261123220535, #5929) ─────────────────────
//
// school-layer.md § 4.3's database-level checks for this slice:
//
//   - the seed makes one school per directory university, each with one
//     current slug: the short name when only that school carries it, else
//     the full name, and never a reserved word;
//   - school slugs keep tenant slugs' rules (never renamed, never moved,
//     never taken by another school);
//   - `verify_school_domain` refuses an overlapping domain ("Domains");
//   - the code functions refuse an unverified school and a wrong domain,
//     hold the resend wait and the per-address ceiling, count wrong tries to
//     exhaustion, refuse an address another account verified, and write the
//     `school_members` row on a match;
//   - account deletion (`anonymize_user`) leaves no `school_members` or code
//     row for the person ("Account deletion");
//   - `school_chapters` holds one live link per pair;
//   - every new table has RLS on and no policy, and no client role may call
//     the functions (§ 4.1).
//
// The rows it adds are deleted at the end; the seeded schools stay.
console.log("\n=== Functional: school layer (20261123220535) ===");
try {
  const U1 = "a5929000-0000-4000-8000-000000000001";
  const U2 = "a5929000-0000-4000-8000-000000000002";
  const CH = "c5929000-0000-4000-8000-00000000000a";
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const fails = async (sql, params = []) => {
    try {
      await db.query(sql, params);
      return "succeeded";
    } catch (e) {
      return String(e?.message ?? e).split("\n")[0];
    }
  };

  // ── The seed ──
  const counts = await one(`
    select
      (select count(distinct d.university)::int from chapter_directory d
        where d.source <> 'retired' and btrim(d.university) <> ''
          and not exists (
            select 1 from schools s where s.directory_university = d.university
          )) as universities_without_school,
      (select count(*)::int from schools s where (
        select count(*) from school_slugs ss
         where ss.school_id = s.id and ss.retired_at is null) <> 1) as not_one_slug,
      (select count(*)::int from school_slugs
        where public.is_reserved_tenant_slug(slug)) as reserved
  `);
  const slugOf = async (university) =>
    (
      await one(
        `select ss.slug from school_slugs ss join schools s on s.id = ss.school_id
          where s.directory_university = $1 and ss.retired_at is null`,
        [university],
      )
    )?.slug ?? null;
  const rpiSlug = await slugOf("Rensselaer Polytechnic Institute");
  const asuSlug = await slugOf("Arizona State University");
  const rpi = (
    await one(
      `select id from schools where directory_university = 'Rensselaer Polytechnic Institute'`,
    )
  )?.id;
  const mit = (
    await one(
      `select id from schools where directory_university = 'Massachusetts Institute of Technology'`,
    )
  )?.id;
  const reseed = (
    await one(`select public.backfill_schools_from_directory() as n`)
  )?.n;

  // ── School slugs ──
  // RPI renames (retires `rpi`, takes another), and MIT retires its own
  // current slug, so only the primary key stands between MIT and `rpi`.
  const mitSlug = (
    await one(
      `select slug from school_slugs where school_id = $1 and retired_at is null`,
      [mit],
    )
  )?.slug;
  await db.query(
    `update school_slugs set retired_at = now() where slug in ($1, $2)`,
    [rpiSlug, mitSlug],
  );
  await db.query(
    `insert into school_slugs (slug, school_id) values ('rpi-renamed-tier', $1)`,
    [rpi],
  );
  const stealSlug = await fails(
    `insert into school_slugs (slug, school_id) values ($1, $2)`,
    [rpiSlug, mit],
  );
  const stealUpsert = await fails(
    `insert into school_slugs (slug, school_id) values ($1, $2)
     on conflict (slug) do update set school_id = excluded.school_id, retired_at = null`,
    [rpiSlug, mit],
  );
  await db.query(`delete from school_slugs where slug = 'rpi-renamed-tier'`);
  await db.query(
    `update school_slugs set retired_at = null where slug in ($1, $2)`,
    [rpiSlug, mitSlug],
  );
  const renameSlug = await fails(
    `update school_slugs set slug = 'rpi-renamed' where slug = $1`,
    [rpiSlug],
  );
  const moveSlug = await fails(
    `update school_slugs set school_id = $2 where slug = $1`,
    [rpiSlug, mit],
  );

  // ── Domains ──
  await db.query(
    `update schools set status = 'verified' where id in ($1, $2)`,
    [rpi, mit],
  );
  await db.query(
    `select public.verify_school_domain($1, 'rpi.edu', true, 'staff', null)`,
    [rpi],
  );
  const overlapUnder = await fails(
    `select public.verify_school_domain($1, 'alum.rpi.edu', false, 'staff', null)`,
    [mit],
  );
  const overlapSame = await fails(
    `select public.verify_school_domain($1, 'rpi.edu', false, 'staff', null)`,
    [mit],
  );
  const overlapOver = await fails(
    `select public.verify_school_domain($1, 'edu', true, 'staff', null)`,
    [mit],
  );
  const mitDomain = await fails(
    `select public.verify_school_domain($1, 'mit.edu', false, 'staff', null)`,
    [mit],
  );

  // ── Codes ──
  await db.query(
    `insert into users (id, email, display_name, supabase_auth_id) values
       ($1, 'u1@example.com', 'U One', gen_random_uuid()),
       ($2, 'u2@example.com', 'U Two', gen_random_uuid())`,
    [U1, U2],
  );
  // (user, school, email, salt, hash, ip, ttl, window, per address, per ip,
  //  per account, cooldown)
  const startArgs = (
    user,
    school,
    email,
    hash,
    cooldown = 0,
    { ip = "ip-hash", perIp = 20, perAccount = 10 } = {},
  ) => [
    user,
    school,
    email,
    "salt",
    hash,
    ip,
    600,
    3600,
    2,
    perIp,
    perAccount,
    cooldown,
  ];
  const start = async (...args) =>
    (
      await one(
        `select public.start_school_email_verification($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) as r`,
        startArgs(...args),
      )
    )?.r;
  const outcomeOf = async (id) =>
    (
      await one(
        `select outcome from school_email_verifications where id = $1`,
        [id],
      )
    )?.outcome ?? null;
  const confirm = async (user, school, id, hash, max = 3) =>
    (
      await one(
        `select public.confirm_school_email_verification($1, $2, $3, $4, $5) as r`,
        [user, school, id, hash, max],
      )
    )?.r;

  const unverifiedSchool = (
    await one(
      `select id from schools where status = 'unverified' order by name limit 1`,
    )
  )?.id;
  const onUnverified = (await start(U1, unverifiedSchool, "a@rpi.edu", "h"))
    ?.reason;
  const wrongDomain = (await start(U1, rpi, "a@gmail.com", "h"))?.reason;
  // The domain is read after the last `@`, as mail is delivered.
  const quoted = (await start(U1, rpi, '"a@rpi.edu@x"@evil.com', "h"))?.reason;
  const subdomain = await start(U1, rpi, "A@Student.RPI.edu", "h1");
  const subdomainEmail = (
    await one(`select email from school_email_verifications where id = $1`, [
      subdomain?.id,
    ])
  )?.email;
  const cooldown = (await start(U1, rpi, "a@student.rpi.edu", "h2", 60))
    ?.reason;
  // A second code to the same address (no wait), then the ceiling of 2.
  const second = await start(U1, rpi, "a@student.rpi.edu", "h3");
  const addressLimit = (await start(U2, rpi, "a@student.rpi.edu", "h4"))
    ?.reason;
  // A `+tag` reaches the same mailbox, so it counts as the same address.
  const plusLimit = (await start(U2, rpi, "a+x@student.rpi.edu", "h4"))?.reason;
  // A new code leaves the earlier one open until a match.
  const earlierOpen = await outcomeOf(subdomain?.id);

  const wrong1 = await confirm(U1, rpi, second?.id, "nope");
  const otherUser = (await confirm(U2, rpi, second?.id, "h3"))?.reason;
  const match = await confirm(U1, rpi, second?.id, "h3");
  const member = await one(
    `select status, verified_via, verified_email from school_members
      where school_id = $1 and user_id = $2`,
    [rpi, U1],
  );
  const reuse = (await confirm(U1, rpi, second?.id, "h3"))?.reason;
  const earlierAfterMatch = await outcomeOf(subdomain?.id);

  // U2 proves the same address: refused after the code matches.
  const u2Code = await start(U2, rpi, "b@rpi.edu", "h5");
  // The same mailbox, spelled with a `+tag` and capitals.
  await db.query(
    `update school_email_verifications set email = 'A+tag@Student.rpi.edu' where id = $1`,
    [u2Code?.id],
  );
  const taken = (await confirm(U2, rpi, u2Code?.id, "h5"))?.reason;

  // A code whose email didn't go out is discarded: the earlier code stays
  // open and still works, and the discarded one counts toward nothing.
  const kept = await start(U2, rpi, "c@rpi.edu", "h7");
  const unsent = await start(U2, rpi, "c@rpi.edu", "h8");
  await db.query(`select public.discard_school_email_verification($1, $2)`, [
    U2,
    unsent?.id,
  ]);
  const afterDiscard = await one(
    `select
       (select count(*)::int from school_email_verifications where id = $1) as unsent,
       (select count(*)::int from school_email_verifications
         where public.school_email_key(email) = 'c@rpi.edu') as counted`,
    [unsent?.id],
  );
  const keptWorks = (await confirm(U2, rpi, kept?.id, "h7"))?.ok;

  // The per-IP and per-account ceilings, each alone (fresh addresses).
  const ipLimit = (await start(U2, mit, "d@mit.edu", "h9", 0, { perIp: 1 }))
    ?.reason;
  const accountLimit = (
    await start(U2, mit, "e@mit.edu", "h9", 0, {
      ip: "another-ip",
      perAccount: 1,
    })
  )?.reason;

  // Exhaustion: three wrong tries close the code.
  const u2Again = await start(U2, mit, "b@mit.edu", "h6");
  const tries = [];
  for (let i = 0; i < 3; i += 1) {
    tries.push((await confirm(U2, mit, u2Again?.id, "nope"))?.reason);
  }
  const afterExhausted = (await confirm(U2, mit, u2Again?.id, "h6"))?.reason;

  // ── Account deletion ──
  await db.query(`select * from anonymize_user($1)`, [U1]);
  const leftover = await one(
    `select
       (select count(*)::int from school_members where user_id = $1) as members,
       (select count(*)::int from school_email_verifications where user_id = $1) as codes`,
    [U1],
  );

  // ── school_chapters ──
  await db.query(
    `insert into chapters (id, name, university) values ($1, 'School Tier', 'RPI')`,
    [CH],
  );
  await db.query(
    `insert into school_chapters (school_id, chapter_id) values ($1, $2)`,
    [rpi, CH],
  );
  const secondLink = await fails(
    `insert into school_chapters (school_id, chapter_id) values ($1, $2)`,
    [rpi, CH],
  );
  const badStatus = await fails(
    `insert into school_chapters (school_id, chapter_id, status) values ($1, $2, 'withdrawn')`,
    [mit, CH],
  );

  // ── Posture ──
  const posture = (
    await db.query(`
      select c.relname, c.relrowsecurity,
             (select count(*)::int from pg_policies p
               where p.schemaname = 'public' and p.tablename = c.relname) as policies
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname in ('schools', 'school_email_domains', 'school_slugs',
                           'school_members', 'school_email_verifications',
                           'school_chapters')
       order by c.relname`)
  ).rows;
  const callable = (
    await db.query(`
      select r.rolname || ':' || f.name as grant
        from pg_roles r
        cross join (values
          ('public.verify_school_domain(uuid, text, boolean, text, uuid)'),
          ('public.search_schools(text, integer)'),
          ('public.start_school_email_verification(uuid, uuid, text, text, text, text, integer, integer, integer, integer, integer, integer)'),
          ('public.confirm_school_email_verification(uuid, uuid, uuid, text, integer)'),
          ('public.backfill_schools_from_directory()')
        ) as f(name)
       where r.rolname in ('anon', 'authenticated')
         and has_function_privilege(r.rolname, f.name, 'execute')`)
  ).rows.map((r) => r.grant);

  const SCENARIOS = [
    {
      name: "one school per directory university, each with exactly one current slug",
      got: JSON.stringify([
        counts.universities_without_school,
        counts.not_one_slug,
      ]),
      want: JSON.stringify([0, 0]),
    },
    {
      name: "a short name only one school carries is its slug (RPI → rpi)",
      got: rpiSlug,
      want: "rpi",
    },
    {
      name: "a short name several schools carry gives way to the full name (ASU)",
      got: asuSlug,
      want: "arizona-state-university",
    },
    {
      name: "no school slug is a reserved word",
      got: String(counts.reserved),
      want: "0",
    },
    {
      name: "the seed runs again without adding a school",
      got: String(reseed),
      want: "0",
    },
    {
      name: "another school can't take a retired slug, by insert or upsert",
      got: JSON.stringify([
        /school_slugs_pkey/.test(stealSlug) ? "refused" : stealSlug,
        /never moves/.test(stealUpsert) ? "refused" : stealUpsert,
      ]),
      want: JSON.stringify(["refused", "refused"]),
    },
    {
      name: "a school slug is never renamed or moved in place",
      got: JSON.stringify([
        /never renamed/.test(renameSlug),
        /never moves/.test(moveSlug),
      ]),
      want: JSON.stringify([true, true]),
    },
    {
      name: "verify_school_domain refuses a domain under, equal to or over another school's",
      got: JSON.stringify(
        [overlapUnder, overlapSame, overlapOver].map((r) =>
          /overlaps another school/.test(r) ? "refused" : r,
        ),
      ),
      want: JSON.stringify(["refused", "refused", "refused"]),
    },
    {
      name: "a domain no other school holds verifies",
      got: mitDomain,
      want: "succeeded",
    },
    {
      name: "an unverified school, an address off the domains, and a quoted one naming the domain first get no code",
      got: JSON.stringify([onUnverified, wrongDomain, quoted]),
      want: JSON.stringify([
        "school_not_verifiable",
        "wrong_domain",
        "wrong_domain",
      ]),
    },
    {
      name: "a subdomain counts under include_subdomains, stored in lower case",
      got: JSON.stringify([subdomain?.ok, subdomainEmail]),
      want: JSON.stringify([true, "a@student.rpi.edu"]),
    },
    {
      name: "the resend wait, then the per-address ceiling, whoever asks and however a +tag spells it",
      got: JSON.stringify([cooldown, second?.ok, addressLimit, plusLimit]),
      want: JSON.stringify([
        "cooldown",
        true,
        "address_limit",
        "address_limit",
      ]),
    },
    {
      name: "a new code leaves the earlier one open; a match closes it",
      got: JSON.stringify([earlierOpen, earlierAfterMatch]),
      want: JSON.stringify([null, "superseded"]),
    },
    {
      name: "a discarded unsent code is gone, counts toward nothing, and the earlier code works",
      got: JSON.stringify([afterDiscard, keptWorks]),
      want: JSON.stringify([{ unsent: 0, counted: 1 }, true]),
    },
    {
      name: "the per-IP and per-account ceilings each refuse on their own",
      got: JSON.stringify([ipLimit, accountLimit]),
      want: JSON.stringify(["ip_limit", "account_limit"]),
    },
    {
      name: "a wrong code counts down; another account can't use the code",
      got: JSON.stringify([wrong1?.reason, wrong1?.attempts_left, otherUser]),
      want: JSON.stringify(["wrong_code", 2, "no_code"]),
    },
    {
      name: "the right code writes the school membership, and works once",
      got: JSON.stringify([match?.ok, member, reuse]),
      want: JSON.stringify([
        true,
        {
          status: "member",
          verified_via: "email_code",
          verified_email: "a@student.rpi.edu",
        },
        "no_code",
      ]),
    },
    {
      name: "an address another account verified, even with a +tag, is refused after its code matches",
      got: taken,
      want: "address_taken",
    },
    {
      name: "the last wrong try closes the code, and the right one no longer works",
      got: JSON.stringify([...tries, afterExhausted]),
      want: JSON.stringify([
        "wrong_code",
        "wrong_code",
        "too_many_attempts",
        "too_many_attempts",
      ]),
    },
    {
      name: "account deletion leaves no school membership or code (§ 3.5)",
      got: JSON.stringify(leftover),
      want: JSON.stringify({ members: 0, codes: 0 }),
    },
    {
      name: "one live school link per chapter and school, and only the four states",
      got: JSON.stringify([
        /school_chapters_live_pair/.test(secondLink),
        /school_chapters_status_check/.test(badStatus),
      ]),
      want: JSON.stringify([true, true]),
    },
    {
      name: "every school table has RLS on and no policy (§ 4.1)",
      got: JSON.stringify(
        posture
          .filter((t) => !t.relrowsecurity || t.policies > 0)
          .map((t) => t.relname),
      ),
      want: JSON.stringify([]),
    },
    {
      name: "anon and authenticated can't call the school functions",
      got: callable.join(","),
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

  await db.query(`delete from school_chapters where chapter_id = $1`, [CH]);
  await db.query(`delete from chapters where id = $1`, [CH]);
  await db.query(
    `delete from school_email_verifications where user_id in ($1, $2)`,
    [U1, U2],
  );
  await db.query(`delete from school_members where user_id in ($1, $2)`, [
    U1,
    U2,
  ]);
  await db.query(
    `delete from school_email_domains where school_id in ($1, $2)`,
    [rpi, mit],
  );
  await db.query(
    `update schools set status = 'unverified' where id in ($1, $2)`,
    [rpi, mit],
  );
} catch (e) {
  miss();
  console.log(
    `MISS  school layer (#5929)\n        ↳ ${String(e?.message ?? e).split("\n")[0]}`,
  );
}
