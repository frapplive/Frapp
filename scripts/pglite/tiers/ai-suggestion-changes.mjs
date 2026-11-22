import { db, miss } from "../harness.mjs";

// ─── Functional: AI suggestion change log (20261122221259, Paul 2026-11-22) ──
//
// What a person changed when deciding on an AI suggestion. It checks:
//
//   - `fields` takes verdicts with ids and numbers and refuses a sentence;
//   - a row can't be kept longer than 90 days;
//   - a decided suggestion can't keep its sealed question;
//   - the decider leaving the chapter takes their rows with them;
//   - RLS is on with no policies.
//
// Everything runs inside one transaction and is rolled back.
console.log("\n=== Functional: AI suggestion change log (20261122221259) ===");
{
  const CH = "a5c00000-0000-4000-8000-00000000000a";
  const U1 = "a5c00000-0000-4000-8000-0000000000a1";
  const S = (n) => `a5c00000-0000-4000-8000-0000000000b${n}`;
  const ROLE = "a5c00000-0000-4000-8000-0000000000c1";
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok, detail });
  const rows = async (text, params = []) => (await db.query(text, params)).rows;
  const refused = async (fn) => {
    await db.exec("savepoint expect_refusal");
    try {
      await fn();
      await db.exec("release savepoint expect_refusal");
      return false;
    } catch {
      await db.exec("rollback to savepoint expect_refusal");
      return true;
    }
  };
  const suggestion = (n, over = {}) => {
    const row = { status: "dismissed", request_sealed: null, ...over };
    return db.query(
      `insert into ai_suggestions
         (id, chapter_id, batch_id, ordinal, kind, source_type, source_id,
          required_permission, status, decided_by, decided_at, expires_at,
          request_sealed, ask_id)
       values ($1, $2, gen_random_uuid(), 0, 'task', 'request', $3,
               'tasks:manage', $4, $3,
               case when $4 = 'pending' then null else now() end,
               now() + interval '1 day', $5, gen_random_uuid())`,
      [S(n), CH, U1, row.status, row.request_sealed],
    );
  };
  const change = (n, over = {}) => {
    const row = {
      fields: { title: { verdict: "kept" } },
      days: 90,
      decision: "accepted",
      decided_by: U1,
      ...over,
    };
    return db.query(
      `insert into ai_suggestion_changes
         (suggestion_id, chapter_id, member_id, decided_by, kind, source_type,
          decision, via, fields, decided_at, expires_at)
       select $1, $2, m.id, $3, 'task', 'request', $4, 'card', $5::jsonb,
              now(), now() + make_interval(days => $6)
         from members m where m.user_id = $7 and m.chapter_id = $2`,
      [
        S(n),
        CH,
        row.decided_by,
        row.decision,
        JSON.stringify(row.fields),
        row.days,
        U1,
      ],
    );
  };

  try {
    await db.exec(`
      begin;
      insert into chapters (id, name, university) values ('${CH}', 'A', 'U');
      insert into users (id, supabase_auth_id, email, display_name) values
        ('${U1}', gen_random_uuid(), 'c1@example.com', 'One');
      insert into members (user_id, chapter_id) values ('${U1}', '${CH}');
    `);

    check(
      "a decided suggestion can't keep its sealed question",
      await refused(() => suggestion(9, { request_sealed: "v1.k.a.b.c" })),
      {},
    );
    await suggestion(8, { status: "pending", request_sealed: "v1.k.a.b.c" });
    check("a waiting suggestion keeps its sealed question", true, {});

    for (const n of [1, 2, 3, 4, 5]) await suggestion(n);

    await change(1, {
      fields: {
        optional_role_ids: { verdict: "added", proposed: null, saved: [ROLE] },
        start_time: {
          verdict: "changed",
          proposed: 1796000000,
          saved: 1796001800,
          delta_minutes: 30,
        },
        is_mandatory: { verdict: "kept", proposed: false, saved: false },
      },
    });
    check("verdicts with ids, numbers and booleans are kept", true, {});

    const sentence = {
      inSaved: await refused(() =>
        change(2, {
          fields: { title: { verdict: "changed", saved: "Formal at 8" } },
        }),
      ),
      inArray: await refused(() =>
        change(2, {
          fields: { roles: { verdict: "changed", saved: ["Executive Board"] } },
        }),
      ),
      unknownVerdict: await refused(() =>
        change(2, { fields: { title: { verdict: "rewritten" } } }),
      ),
      unknownKey: await refused(() =>
        change(2, { fields: { title: { verdict: "kept", note: 1 } } }),
      ),
    };
    check(
      "fields refuse a sentence, an unknown verdict and an unknown key",
      Object.values(sentence).every(Boolean),
      { sentence },
    );
    check(
      "a change can't be kept longer than 90 days",
      await refused(() => change(3, { days: 91 })),
      {},
    );
    check(
      "only an expired suggestion has no decider",
      await refused(() => change(4, { decided_by: null })),
      {},
    );

    await db.query(`delete from members where user_id = $1`, [U1]);
    const left = await rows(
      `select count(*)::int as n from ai_suggestion_changes where chapter_id = $1`,
      [CH],
    );
    check("the decider leaving the chapter takes their rows", left[0].n === 0, {
      left,
    });

    const rls = await rows(
      `select relrowsecurity as on,
              (select count(*)::int from pg_policies where tablename = 'ai_suggestion_changes') as policies
         from pg_class where relname = 'ai_suggestion_changes'`,
    );
    check(
      "RLS is on with no policies",
      rls[0]?.on === true && rls[0]?.policies === 0,
      { rls },
    );
  } catch (e) {
    check("the tier ran to the end", false, {
      error: String(e?.message ?? e).split("\n")[0],
    });
  } finally {
    await db.exec("rollback");
  }

  for (const r of results) {
    if (r.ok) {
      console.log(`OK    ${r.name}`);
    } else {
      miss();
      console.log(
        `MISS  ${r.name}\n        ↳ ${JSON.stringify(r.detail).slice(0, 600)}`,
      );
    }
  }
}
