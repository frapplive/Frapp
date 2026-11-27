import { db, miss } from "../harness.mjs";

console.log("\n=== Functional: api_work_due wakes staging only for due work (#6188) ===");
{
  // `api_work_due` (20261127210946) copies the candidate queries of the
  // reminder sweeps in scheduled-jobs.service.ts and three other sweep
  // services, so nothing in the API's unit suites covers it. A check that
  // matches too much keeps staging awake (an optional event did, before
  // review); one that matches too little drops a reminder while it sleeps.
  // `now` is far in the future so no other tier's rows fall in a window.
  const NOW = "2091-03-04 12:00:00+00";
  const CHAPTER = "a6188000-0000-4000-8000-00000000000c";
  const USER = "a6188000-0000-4000-8000-0000000000a1";
  const MEMBER = "a6188000-0000-4000-8000-0000000000d1";
  const CHANNEL = "a6188000-0000-4000-8000-0000000000f1";
  const MESSAGE = "a6188000-0000-4000-8000-000000000011";
  const MEETING = "a6188000-0000-4000-8000-000000000021";
  const EVENT = "a6188000-0000-4000-8000-0000000000e1";
  const TASK = "a6188000-0000-4000-8000-0000000000b1";
  const SERIES = "a6188000-0000-4000-8000-0000000000c2";
  const at = (offset) => `(timestamptz '${NOW}' + interval '${offset}')`;

  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok, detail });
  const due = async () =>
    (await db.query(`select public.api_work_due(timestamptz '${NOW}') as due`)).rows[0].due;
  // Run `sql`, read the check, and undo `sql`, so each case starts empty.
  const dueWith = async (sql) => {
    await db.exec("savepoint c;");
    try {
      await db.exec(sql);
      return await due();
    } finally {
      await db.exec("rollback to savepoint c;");
    }
  };
  const event = (cols, vals) =>
    `insert into events (id, chapter_id, name, start_time, end_time, timing, calendar_only${cols})
       values ('${EVENT}', '${CHAPTER}', 'E', ${at("20 minutes")}, ${at("80 minutes")}, 'timed', false${vals});`;
  const eventClaim = `insert into scheduled_notification_dispatches (chapter_id, entity_type, entity_id, threshold, due_date)
       values ('${CHAPTER}', 'EVENT', '${EVENT}', 'EVENT_REMINDER', '2091-03-04');`;
  const task = (dueAt, status = "TODO") =>
    `insert into tasks (id, chapter_id, title, assignee_id, created_by, due_at, due_date, status)
       values ('${TASK}', '${CHAPTER}', 'T', '${USER}', '${USER}', ${at(dueAt)}, '2091-03-04', '${status}');`;
  const taskClaim = (threshold) =>
    `insert into scheduled_notification_dispatches (chapter_id, entity_type, entity_id, threshold, due_date)
       values ('${CHAPTER}', 'TASK', '${TASK}', '${threshold}', '2091-03-04');`;
  const window = (table, cols, vals, offset) =>
    `insert into ${table} (${cols}) values (${vals.replace("$AT", at(offset))});`;
  const chatReminder = (offset, fired = "null") =>
    window(
      "chat_message_reminders",
      "user_id, message_id, chapter_id, remind_at, fired_at",
      `'${USER}', '${MESSAGE}', '${CHAPTER}', $AT, ${fired}`,
      offset,
    );

  try {
    await db.exec(`
      begin;
      insert into chapters (id, name, university) values ('${CHAPTER}', 'C', 'U');
      insert into users (id, supabase_auth_id, email) values ('${USER}', gen_random_uuid(), 'a6188@example.test');
      insert into members (id, user_id, chapter_id) values ('${MEMBER}', '${USER}', '${CHAPTER}');
      insert into chat_channels (id, chapter_id, name, type) values ('${CHANNEL}', '${CHAPTER}', 'g', 'PUBLIC');
      insert into chat_messages (id, channel_id, sender_id, content) values ('${MESSAGE}', '${CHANNEL}', '${USER}', 'hi');
      insert into meetings (id, chapter_id, event_name, event_start_time, meeting_type)
        values ('${MEETING}', '${CHAPTER}', 'M', now(), 'chapter');
    `);

    const cases = [
      ["nothing due", "select 1;", false],
      // Events: the sweep's eventRequiresAnyone, not its looser prefilter.
      ["a mandatory event 20 minutes out", event(", is_mandatory", ", true"), true],
      ["the same event once its reminder is claimed", event(", is_mandatory", ", true") + eventClaim, false],
      ["an optional event saved with an empty role list", event(", is_mandatory, required_role_ids, others_invited", ", false, '{}', true"), false],
      ["an event that requires a role", event(", is_mandatory, required_role_ids", `, false, array['${MEMBER}'::uuid]`), true],
      ["a mandatory event that invites only listed roles, with none listed", event(", is_mandatory, required_role_ids, others_invited", ", true, '{}', false"), false],
      ["a mandatory event 34 minutes out (window plus lead)", event(", is_mandatory", ", true").replace(at("20 minutes"), at("34 minutes")), true],
      ["a mandatory event 40 minutes out", event(", is_mandatory", ", true").replace(at("20 minutes"), at("40 minutes")), false],
      ["a mandatory event that started a minute ago", event(", is_mandatory", ", true").replace(at("20 minutes"), at("-1 minutes")), false],
      // Timed tasks: due soon, then overdue, each until its claim.
      ["a task due in 50 minutes", task("50 minutes"), true],
      ["a task due in 64 minutes", task("64 minutes"), true],
      ["a task due in 70 minutes", task("70 minutes"), false],
      ["a task due in 50 minutes with its due-soon claim", task("50 minutes") + taskClaim("DUE_SOON"), false],
      ["a task 10 minutes overdue", task("-10 minutes"), true],
      ["a task 10 minutes overdue with its overdue claim", task("-10 minutes") + taskClaim("OVERDUE"), false],
      ["a task 40 minutes overdue", task("-40 minutes"), false],
      ["a completed task 10 minutes overdue", task("-10 minutes", "COMPLETED"), false],
      // A repeating task's next copy is made by the same tick.
      [
        "a live series whose latest copy fell due 2 minutes ago",
        `insert into task_series (id, chapter_id, created_by, title, assignee_id, recurrence_rule, first_due_date, next_due_date, latest_due_at)
           values ('${SERIES}', '${CHAPTER}', '${USER}', 'S', '${USER}', 'FREQ=DAILY', '2091-03-03', '2091-03-05', ${at("-2 minutes")});`,
        true,
      ],
      [
        "an ended series",
        `insert into task_series (id, chapter_id, created_by, title, assignee_id, recurrence_rule, first_due_date, next_due_date, latest_due_at, ended_at)
           values ('${SERIES}', '${CHAPTER}', '${USER}', 'S', '${USER}', 'FREQ=DAILY', '2091-03-03', '2091-03-05', ${at("-2 minutes")}, now());`,
        false,
      ],
      // The other sweeps: due between 30 minutes ago and 5 minutes ahead.
      ["a chat reminder due in 3 minutes", chatReminder("3 minutes"), true],
      ["a fired chat reminder", chatReminder("3 minutes", "now()"), false],
      ["a chat reminder 45 minutes old", chatReminder("-45 minutes"), false],
      [
        "a meeting-date reminder due 2 minutes ago",
        window("meeting_date_reminders", "user_id, chapter_id, meeting_id, day, text, remind_at", `'${USER}', '${CHAPTER}', '${MEETING}', '2091-03-04', 'x', $AT`, "-2 minutes"),
        true,
      ],
      [
        "a scheduled message due in 4 minutes",
        window("chat_scheduled_messages", "chapter_id, channel_id, user_id, member_id, content, send_at", `'${CHAPTER}', '${CHANNEL}', '${USER}', '${MEMBER}', 'hi', $AT`, "4 minutes"),
        true,
      ],
      [
        "a scheduled message due in 6 minutes",
        window("chat_scheduled_messages", "chapter_id, channel_id, user_id, member_id, content, send_at", `'${CHAPTER}', '${CHANNEL}', '${USER}', '${MEMBER}', 'hi', $AT`, "6 minutes"),
        false,
      ],
    ];
    for (const [name, sql, expected] of cases) {
      let got;
      try {
        got = await dueWith(sql);
      } catch (e) {
        got = String(e?.message ?? e).split("\n")[0];
      }
      check(`${name}: ${expected ? "wakes" : "doesn't wake"}`, got === expected, { got });
    }
  } catch (e) {
    check("api-work-due scenario ran", false, String(e?.message ?? e).split("\n")[0]);
  } finally {
    await db.exec("rollback;").catch(() => {});
  }

  for (const r of results) {
    if (r.ok) {
      console.log(`OK    ${r.name}`);
    } else {
      miss();
      console.log(`MISS  ${r.name}\n        ↳ ${JSON.stringify(r.detail ?? null).slice(0, 300)}`);
    }
  }
}
