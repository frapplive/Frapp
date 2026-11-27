---
name: multi-agent
description: >
  Facts and mechanics for multi-agent work in this repo: a Workflow script, a subagent fan-out, or
  an ultracode run. Use before authoring or launching a Workflow or a sizeable fan-out, and when
  choosing what effort an agent runs at. Covers what agents cost, what effort they really run at,
  worktrees, pinned SHAs, and reading a workflow's results. Sizing is the session's judgment.
---

# Multi-agent work: cost, effort, mechanics

Since 2026-11-27 (Paul; [ADR-23](../../../spec/architecture/adr/adr-23.md) amendment 3) a session
sizes its own fan-outs and sets its own subagent effort. There is no agent cap, and the repo sets no
`workflowSizeGuideline`. This skill keeps what's worth knowing when you choose: what things cost,
what effort an agent really runs at, and the mechanics that bite.

## Cost

- **`/diff-review` is the review gate.** A branch's first review runs through the saved workflow
  `frapp-review`, whose shape is fixed in code. Another review on top of it is your call; weigh it
  against what the gate already covered.
- **An agent pays for its own context.** One agent can cover several angles, files or claims, and
  splitting pays when each piece needs its own heavy context or the pieces can run in parallel.
- **Every launch re-reads.** A subagent starts cold, so a check you can do with a few tool calls is
  usually cheaper done inline.

## Effort

Every subagent inherits the session's effort unless something sets its own. Opus 5.5 defaults to
`medium`. Ultracode used to raise the session to `xhigh`. Since Claude Code 2.1.284 it is its own
toggle (`/effort ultracode on|off`) that, per the CLI's changelog, "no longer forces xhigh effort and
stays on at any effort level"; only `ultracode` given as the level itself still means `xhigh`
(checked against 2.1.285, 2026-09-30). Measured on 2026-09-23, in sessions running at `xhigh`,
from the `"effort"` field in subagent transcripts:

| Launch | Ran at |
|---|---|
| Workflow `agent()` with `effort: 'medium'` | medium |
| Workflow `agent({ agentType: 'claim-verifier', effort: 'high' })` | high |
| Workflow `agent()` with no `effort` | the session's (xhigh) |
| Agent tool, any type, with no `effort` in its agent file (as loaded at session start) | the session's (xhigh) |

- **In a workflow, an `agent()` without `effort` runs at the session's level.** Pass one when the
  task needs less (or more) thinking than the session runs at.
- **The Agent tool has no effort parameter.** `diff-finder` and `claim-verifier` pin theirs in
  frontmatter (`high` and `medium`), and the frontmatter wins: in a session running at `xhigh`
  (2026-09-30), `diff-finder` ran at `high` and `claim-verifier` at `medium`. Built-in types
  (`general-purpose`, `Explore`) always inherit; a workflow with explicit `effort` is the way to run
  them at another level.
- **Choosing a session's level.** Anthropic's guidance for Opus 5.5 (the Claude API skill bundled
  with Claude Code 2.1.285, § Migrating to Claude Opus 5.5 → Choosing an effort level, read
  2026-09-30): the default `medium` matched or beat Opus 5 at `high` on agentic coding in
  Anthropic's testing; start there, and keep `xhigh` and `max` for work where they have shown a
  gain, because at those levels Opus 5.5 thinks more per turn and runs long turns. To get less
  thinking, lower the level rather than prompting for it. `/effort <level>` can also save the level
  as the default for new sessions, and its reply says whether it did.
- **To check what ran**, read the transcripts. They live in
  `~/.claude/projects/<cwd-slug>/<session-id>/subagents/`, with workflow agents under
  `workflows/<runId>/`: `grep -o '"effort":"[a-z]*"' agent-*.jsonl | sort | uniq -c`.

## Mechanics

- **Agents that edit files run in worktrees** (`isolation: 'worktree'` on `agent()` or the Agent
  tool). While any agent works in the main checkout, don't commit, reset, merge, stash or check
  out there. The agents would read a moving tree, and a stop hook would report their half-done
  edits as your uncommitted work.
- **A new worktree starts at `origin/main`, not at your HEAD.** `worktree.baseRef` defaults to
  `fresh`. Seen in a `frapp-review` run on 2026-09-23: the worktree finder's HEAD was the review
  base, not the reviewed commit. Have the agent run `git checkout -q --detach <sha>` first; the
  commit is there because worktrees share the object store. Have it check the starting HEAD back
  out before it returns if it changed nothing, so the harness can remove the worktree.
- **One branch per worktree.** A branch checked out in one worktree can't be checked out in another
  (`fatal: '<branch>' is already used by worktree`). Stack a new branch on its head instead:
  `git worktree add -b <new-branch> <path> <sha>`.
- **Pin SHAs.** Resolve `origin/main` and any other moving ref to a SHA once, and pass the SHA. A
  background agent's `git fetch` moves `origin/main` mid-session, which silently changes what a
  two-dot diff against it means.
- **Read results from the right file.** The completion notification's inline `<result>` is cut at
  8,000 characters, and the task's `.output` file (path in the notification) holds the full JSON.
  A run that failed or was killed writes no JSON. Its record is `journal.jsonl` in the run's
  transcript dir: a `started` line per agent carries its `agentId` and `label`, and a `result` line
  with the same `agentId` carries what it returned.
- **Compare cost with `<usage>`.** `subagent_tokens` sums each agent's final context plus its
  output. It is good for comparing runs, but it isn't a bill.
- **No silent caps.** When a workflow drops coverage (a cap, a skipped item, a failed agent),
  `log()` it and redo the missing check inline.
