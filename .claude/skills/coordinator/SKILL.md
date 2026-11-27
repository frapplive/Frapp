---
name: coordinator
description: >
  Run a standing coordinator chat that takes Paul's or Shawn's feedback and ideas, refines and
  classifies them, and spins the real work off into worker sessions, keeping a
  shared board page current and handing itself off at 50% context. Use when a session is started
  as a coordinator (for example "Beta Launch"), or when asked to coordinate feedback into parallel
  threads the way a Claude Code project's coordinator does.
---

# Coordinator

> **Since 2026-11-09:** Shawn and Winston, and since 2026-11-10 Evan, work in their own Claude chats
> under their own GitHub accounts ([`AGENTS.md` § Operating mindset](../../../AGENTS.md#operating-mindset)), not through
> this board. The Shawn intake and approval rules below apply only to anything he still brings here.

Claude Code projects, a coordinator chat that spins off threads, aren't offered on Team plans
(checked 2026-11-08, [docs](https://code.claude.com/docs/en/claude-projects)). This skill builds the
same shape from parts this environment has. Checked on 2026-11-08: `create_session` starts a worker
and `get_session` reads its status and context use. The front door both people
share is an artifact page, whose comments sent to Claude wake the session that published it (the
Artifact tool's stated behavior, not yet tried from Shawn's account). A shared session is view-only for
teammates ([docs](https://code.claude.com/docs/en/claude-code-on-the-web), "Share sessions"), so
Shawn reaches the coordinator through the page, not the chat.

## The job

Take whatever Paul or Shawn brings, here or through the board: bugs from using the app, UI notes,
ideas, questions. Do little of the work yourself. Your job is to understand it, route it, and keep
track.

- **Refine, don't correct.** Restate what you understood in a line, ask only what routing needs, and
  sharpen it with what the code and the tracker say. Shawn is the product person: plain words, no
  code, no file paths.
- **Classify and size.** Bug, UI change, feature idea, question, or ops. Decide whether it can be
  done now, how, and how big. Say whether it serves the beta ([#2558](https://github.com/pdcarlson/Frapp/issues/2558)).
- **Route.** Answer a question a few lookups settle, here. Anything that needs research, design or
  code goes to a worker, one per independent piece, and several at once is normal. Point a duplicate
  at its open issue or PR.
- **Pace.** Frapp ships fast and has no users yet. Workers build and open PRs, and nothing waits on
  testers trying an earlier step. Paul merges.
- **Who approves.** Paul's items go straight to building. Shawn's ideas go to a research-and-design
  worker first (scope, options, and a before/after page per
  [`ui-development` § Proposing a UI change](../ui-development/SKILL.md#proposing-a-ui-change)), and
  are built once Paul says go, here or on the board.

## Workers

Start each one with `create_session`: `source_url` `https://github.com/frapplive/Frapp`, a title
naming the work, tags `frapp:coordinator`, and a brief that stands alone. The brief carries:

- the goal and what done looks like;
- what you already know: the asker's words, issues, PRs, files, the board row;
- the constraints: AGENTS.md applies, UI work follows `ui-development`, ship fast;
- this reporting line, verbatim: "Report in your own chat only; do not message the coordinator.
  A decision only Paul can make goes on GitHub, not in chat: file it per `file-follow-up` as a
  `[human] Decide: …` issue naming the issue it blocks, then carry on with work that doesn't depend
  on it. End with done or blocked in one paragraph."

Workers report in their own chats (Paul, 2026-11-10): each message to the coordinator wakes its
whole context, which costs more than the report is worth. Paul doesn't watch worker chats, so a
question asked only there waits unseen; decisions go on issues, where `needs-me` finds them (Paul,
2026-11-27). Add the board row as soon as the worker starts. Nothing wakes you when a worker opens
a PR or blocks, so whenever a message from Paul or a board comment has you awake anyway, read each
open worker's state and bring its row up to date: `get_session` for its status, `list_events` with
`kinds` for its last reply, and its issue and PR. Archive a worker's session (`archive_session`)
once its PR merged or its work is done.

Run at most three workers at once. On 2026-11-25 five ran in parallel, all hit the five-hour
usage limit in the same minute, and three lost their unpushed work.

### Chains

A chain is one worker taking an epic's ordered steps to the end, one PR per step. The first chains
(2026-11-25 to 11-27) stalled for four reasons, and the brief below answers each:

- **A merge woke nothing.** Workers unsubscribed once a PR was green with auto-merge on, so when
  Paul merged it nothing woke them for the next step.
- **Work died unpushed.** A worker that hit the usage limit mid-step lost everything it hadn't
  pushed.
- **Questions waited in a chat nobody read.** A step blocked on an AskUserQuestion that Paul
  never saw.
- **Context ran out mid-chain** (one reached 70% and $100) with the chain's state only in the
  worker's own transcript.

Paste this block into a chain's brief, after its steps:

> **Chain rules.**
> 1. **Ledger first.** Before step 1, post a "Chain status" comment on the epic listing each step:
>    its issue, its branch, what it waits on, and its state. Edit that one comment whenever a step
>    changes state. It is the handoff: a successor needs nothing else.
> 2. **Run ahead.** When a step's PR is open, start the next step at once. A step on a screen no open
>    PR touches starts from `main` and opens its own PR. A step on a screen an open PR holds builds on
>    that PR's branch, and opens its PR after that one merges (`npm run merge:main`).
> 3. **Stay subscribed to what you wait on.** Unsubscribe from a PR only once it has merged, or once
>    nothing left in the chain waits on it. A merge is a PR event, so a subscribed PR wakes you when
>    Paul merges it. Never end a turn with steps left and nothing that will wake you; if that's
>    where you are, end with "blocked: <what you wait on>".
> 4. **Push as you go.** Commit and push each working chunk to the step's branch. A branch's first
>    push before its PR exists is a parking push (`git push --no-verify`, per AGENTS.md); run
>    `/diff-review` before opening the PR.
> 5. **Decisions go on GitHub.** A decision only Paul can make becomes a `[human] Decide: …` issue
>    naming the step it blocks, with the options and your recommendation. Mark the step "waiting on
>    Paul" in the ledger, skip it, and carry on with the next step that doesn't depend on it.
> 6. **Hand off at 50% context.** Bring the ledger up to date, push everything, and end with
>    "handoff: context, ledger on #<epic>". The coordinator starts a successor from the ledger.

When a chain ends on "handoff", start its successor with the same brief plus "Continue from the
Chain status comment on #<epic>". When it ends on "blocked", the ledger says on what.

## The board

The board is an artifact page built from [`hub.html`](hub.html): a live list of the work, and an
**Add an idea** button that opens the comment box, where **Send to Claude** wakes this session.

- **First start.** Publish `hub.html` with `capabilities: {db: {rules: [{path: "threads", read:
  "view", write: "owner"}]}, comments: {composer_only: true}, user: {}}` and the board's name as its
  title. Pass `pin: true` when Paul asked for it pinned. Publishing from this session subscribes it to
  comments sent to Claude. Then tell Paul to share the page with the organization and to give Shawn
  edit access, since Send to Claude is offered only to people who can edit the page.
- **Rows.** One document per piece of work in the `threads` collection: `title`, `asker`, `kind`,
  `status`, `waiting_on`, `summary`, `session_url`, `links` (a list of `{label, url}`), and
  `updated_at` (ISO). `status` is one of `researching`, `designing`, `building`, `in review`,
  `waiting`, `parked`, `done`. Write rows with `ArtifactData` (`batch` for several). Shawn reads
  them, so write them plainly.
- **Comments.** A comment sent to Claude arrives as a new turn. Read it with `ArtifactComments`,
  answer in its thread briefly and plainly, then route it like anything said here.
- **Ledger.** The board holds everything a successor needs. Park work that won't happen now as a
  `parked` row with its reason. Each row links its GitHub issue, filed per `file-follow-up`: the
  issues are the record ([`AGENTS.md` § Work tracking](../../../AGENTS.md#work-tracking)).

## Context: hand off at 50%

The session can't run `/compact` on itself, so it hands off instead. After each turn's work, call
`get_session` with no session id and read `external_metadata.context_usage` (`used_tokens` of
`max_tokens`; it trails by one turn). At 50% or more:

1. Bring the board up to date.
2. Write the handoff per [`handoff`](../handoff/SKILL.md): the board's URL, each open worker's
   session id and state, the decisions and preferences heard so far, and what you were about to do.
   Keep the coordinator's overall goal, say what was done recently, and carry Paul's latest message
   over nearly verbatim, not paraphrased (Paul, 2026-11-10).
3. Start the successor with `create_session`, without asking: this self-handoff is the one exception
   to the handoff skill's wait for the user's go. The same title plus a number, `source_url` the repo,
   and a first message that says to run this skill as the successor of this session, followed by
   the handoff.
4. The successor watches the board's comments with `ArtifactComments`. It doesn't republish.
5. Tell Paul here, with the successor's link, and take no new work in this chat.

## Limits

- **Budget.** Each worker carries about 90,000 tokens of fixed setup before it does anything
  (measured 2026-11-08). Don't start one for what a lookup answers. Group related asks (same screen,
  same subsystem) into one worker rather than one per issue (Paul, 2026-11-09). Archive a worker
  once its PR is green with auto-merge on, or merged: six workers cost $10 to $61 each on
  2026-11-09, and most of the $61 one came after its PR was done, re-reading 600k tokens per wake. Usage credits are off for the
  organization, so heavy use pauses at the seat limit rather than billing.
- **Identity.** Workers run on the coordinator owner's account, GitHub and environment, so anything
  Shawn sends runs as Paul. That is why Shawn's ideas stop at research and design until Paul approves.
- **Hands off.** Never merge or turn on auto-merge, and never change production without Paul.
- **Waking.** Workers can't start sessions, and nothing wakes the coordinator on its own, so a
  chain that hands off or blocks waits until Paul next writes here. Read the chains' ledgers then.
