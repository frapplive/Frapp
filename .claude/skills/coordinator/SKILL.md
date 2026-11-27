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
  Nobody reads this chat, so don't ask questions here: a decision for Paul goes on GitHub as a
  `[human] Decide: …` issue (the `file-follow-up` filing format) naming the issue it blocks, and you
  carry on with work that doesn't depend on it. End with done, blocked or handoff in one paragraph."

Workers report in their own chats (Paul, 2026-11-10): each message to the coordinator wakes its
whole context, which costs more than the report is worth. Paul doesn't watch worker chats, so a
question asked only there waits unseen, and an AskUserQuestion there stalls the worker; decisions
go on issues instead, where `needs-me` finds them (Paul, 2026-11-27). Add the board row as soon as
the worker starts. Nothing wakes you when a worker opens a PR or blocks, so whenever a message from
Paul or a board comment has you awake anyway, read each open worker's state and bring its row up to
date: `get_session` for its status, `list_events` with `kinds` for its last reply, and its issue and
PR. Archive a worker's session (`archive_session`) once its work is done; a chain worker, once its
chain is done or handed off.

Run at most three workers at once. On 2026-11-25 five ran in parallel, all hit the five-hour usage
limit in the same minute, and three lost their unpushed work. The cap doesn't stop that, since every
worker spends the same account's limit; pushing as they go (below) is what bounds the loss.

### Chains

A chain is one worker taking an epic's ordered steps to the end, one PR per step. It is how the
coordinator runs [`handoff` § Keep the work moving](../handoff/SKILL.md#keep-the-work-moving) for
work nobody watches: the worker goes on to the next step itself instead of offering it to a user who
isn't reading its chat. The first chains (2026-11-25 to 11-27) stalled four ways:

- **A merge woke nothing.** Workers unsubscribed once a PR was green with auto-merge on, as
  [`AGENTS.md`](../../../AGENTS.md#autonomous-pr-lifecycle-cloud-sessions) step 5 says, so when Paul
  merged it nothing was listening for the merge that would have woken them
  ([wake coverage](../../../docs/ci-cd/pr-babysitting.md#wake-coverage)).
- **Work died unpushed.** Workers that hit the usage limit mid-step lost everything they hadn't
  pushed.
- **Questions waited in a chat nobody read.**
- **Context ran out mid-chain** (one reached 70% and $100) with the chain's state only in the
  worker's own transcript.

Paste this block into a chain's brief, after its steps:

> **Chain rules.** These replace `handoff` § Keep the work moving's offer to the user, and AGENTS.md
> step 5's unsubscribe-and-end, for this chain.
> 1. **Ledger first.** Before step 1, post one "Chain status" comment on the epic: each step's
>    issue, branch, PR, what it waits on, and its state. Keep that one comment current with
>    `update_issue_comment` (the GitHub MCP edits comments; checked 2026-11-27). It is the handoff:
>    a successor needs nothing else.
> 2. **Run ahead, so you rarely wait.** When a step's PR is open, start the next step at once. A step
>    on a screen no open PR touches branches from `main` and opens its own PR. A step on a screen an
>    open PR holds builds on that PR's branch and opens its PR only after that one merges
>    (`npm run merge:main`).
> 3. **Waiting on a merge.** Stay subscribed to every PR the chain still waits on; unsubscribe only
>    once it has merged or nothing left waits on it. The merge wakes you, as CI and reviews do. A
>    delivery can be lost, so mark each such step "waiting: #N to merge" in the ledger before you
>    end the turn, and check what has merged whenever anything wakes you.
> 4. **Push as you go.** Commit and push each working chunk to the step's branch. A branch's first
>    push before its PR exists is a parking push (`git push --no-verify`); run `/diff-review` before
>    opening the PR, and say in the PR that the first push bypassed the gate and why.
> 5. **Decisions go on GitHub.** Any question for Paul (a product or design choice, a credential, a
>    dashboard step) becomes a `[human] Decide: …` issue in the `file-follow-up` format, naming the
>    step it blocks, with the options and your recommendation. Add `Blocked by #<that issue>` as the
>    last line of the step's body, so `/next` leaves it alone. Mark it "waiting on Paul" in the
>    ledger, and carry on with the next step that doesn't depend on it. Never AskUserQuestion.
> 6. **Hand off at 50% context** (`get_session` with no id reads it; if you can't, after three
>    merged PRs). Bring the ledger up to date, push everything, and call `unsubscribe_pr_activity` on
>    every PR you're subscribed to. If you have `create_session`, start your successor yourself, as
>    the coordinator does its own: the same brief plus "Continue from the Chain status comment on
>    #<epic>. First subscribe to every open PR it lists." Name it in the ledger and end with "handed
>    off to <session>". Otherwise end with "handoff: ledger on #<epic>".

On every wake, read each chain's ledger and session:

- **"handed off to <session>":** archive the worker; its successor is running.
- **"handoff":** archive the worker, and start its successor with the same brief plus "Continue from
  the Chain status comment on #<epic>. First subscribe to every open PR it lists."
- **"waiting: #N to merge", and #N merged a while ago with nothing since:** the wake was lost;
  message the worker to continue.
- **Waiting on Paul, and the `[human] Decide` issue is answered:** message the worker to continue.
- **Stopped with steps left** (failed, or the usage limit): once the limit has reset, start a
  successor from the ledger.

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
  once its PR is green with auto-merge on, or merged (a chain worker, once its chain is done or
  handed off): six workers cost $10 to $61 each on
  2026-11-09, and most of the $61 one came after its PR was done, re-reading 600k tokens per wake. Usage credits are off for the
  organization, so heavy use pauses at the seat limit rather than billing.
- **Identity.** Workers run on the coordinator owner's account, GitHub and environment, so anything
  Shawn sends runs as Paul. That is why Shawn's ideas stop at research and design until Paul approves.
- **Hands off.** Never merge or turn on auto-merge, and never change production without Paul.
- **Waking.** Nothing wakes the coordinator on its own, so a chain that blocks, or hands off
  without starting its successor, waits until Paul next writes here or on the board. Read the
  chains' ledgers then.
