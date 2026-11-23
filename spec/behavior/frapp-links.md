# Frapp links

(Paul 2026-11-22, "Make Ask Frapp task creation richer": one link object for everything a task or an event points at, and events move onto it too.)

A **Frapp link** is one entry in a list of things a task or an event points at. It is one object shared by both lists and both apps (`FrappLink` in [`packages/validation/src/frapp-link.ts`](../../packages/validation/src/frapp-link.ts)), so a task's **Attached** row and an event's **Attachments** section read and edit the same way.

## Kinds

| Kind | Stored | Points at |
| --- | --- | --- |
| `link` | `url` (http or https only, `normalizeFrappLinkUrl`) and a `title` (the domain when none is given) | A web page |
| `document` | `document_id` | A Chapter Files document ([`chapter-docs.md`](chapter-docs.md)) |
| `minutes` | `meeting_id` | A meeting's minutes ([`meetings.md`](meetings.md)) |
| `event` | `event_id` | An event ([`events.md`](events.md)) |
| `message` | `channel_id`, `message_id` | A chat message |

Every entry also has a client-made `id`, unique in its list. A list holds at most 10 (`FRAPP_LINKS_MAX`), and holds each thing once: two entries for the same record, or the same address, are a 400 ("That is attached already.").

## Names are read per reader

A record link stores ids, not a name. A name copied into the list would show to everyone who can see the task, including a member who can't open the record, and would go stale on a rename.

- **Resolve.** `POST /v1/frapp-links/resolve` (any member, `members:view`) takes up to 40 targets and answers each, for the member asking, with `state`:
  - `ok`, with the record's name now and a fact for its row (a meeting's or event's start; a message's channel and sender);
  - `hidden`, when the record is there but not theirs to open (a restricted document, minutes they can't read, an event they can't see, a message in a channel they aren't in). Its name is never sent;
  - `removed`, when it was deleted or was never this chapter's.
- **A row** reads the same on both apps (`frappLinkRow`): the live name and its quiet line ("Chapter Files", "Minutes · Nov 16", "Event · Nov 16", "#general · Moiz · Nov 16"); "You don't have access" or "Removed", which don't open; and the kind's word, dimmed, while the resolve is out.
- **An event's entries keep a title** for phone builds from before Frapp links, which read `title` as required on an event's attachments (#4934). A document keeps the name it had when it was attached, which those builds show. A minutes, event or message entry is titled with its kind's word ("Minutes", "Event", "Message"), never a record's name, so no copied name reaches a reader who can't open it. A task's record links keep no title. Phone builds from before Frapp links skip the kinds they don't know.

## Writing a list

A list is written whole: `attachments` on `POST /v1/tasks`, `PATCH /v1/tasks/:id`, and `PATCH /v1/events/:id` (with `POST /v1/events`). The API normalizes each entry (`normalizeFrappLinks`), and checks that each record **newly added** is one of the chapter's (one read per kind, `FrappLinkChecker`). A record the list already held isn't checked again, so one deleted since never blocks a later save. A refused entry is a 400 naming it.

- **A group task** (`tasks.md` § Tasks for everyone): every copy holds the same list. A group edit (`scope: "group"`) changes it on every copy, checked once.
- **A repeating task** (`tasks.md` § Repeating tasks): the series holds the list, and each new copy is made with it. "All upcoming tasks" changes the series' list as it changes the series' other fields.
- **The database** keeps `tasks.attachments` and `task_series.attachments` as `jsonb` lists of at most 10 (`20261123183858_task_attachments`), as `events.attachments` is.

## Where a link opens

- **Web** (`frappLinkWebHref`): a web link in a new tab; a document in the Documents viewer (`/documents?document=<id>`); minutes at `/meetings/<id>`; an event's sheet (`/events?event=<id>`); a message in its channel (`/chat?channel=<id>&message=<id>`).
- **Phone**: a web link in the in-app browser; a document to read there through its signed link, as Documents opens one (one deleted since says it is gone); minutes, an event and a message on their own screens.

## Attaching

Both apps share one picker (`components/shared/frapp-links.tsx` on web, `components/frapp-links.tsx` on the phone), opened from a quiet **Attach** under the list. One field searches as you type: the member's own Chapter Files, minutes and calendar (`useFrappLinkCandidates` in `@repo/hooks`), so it never offers a record they can't open, and never one the list holds. Chapter Files is left out while that module is off. The same field takes a pasted address:

- **A Frapp address** (`app.frapp.live`, or the app's own origin) attaches the record it names (`parseFrappAppLink`): a document, minutes, an event, or a chat message link from Copy message link.
- **Any other http or https address** attaches as a web link, with an optional Title field under it.

Full, Attach gives way to "Holds 10 attachments." Each row an editor sees ends with a remove control.

## Where lists show

- **Tasks** (`tasks.md` § Attached): the task panel on web, and the task screen on the phone.
- **Events** (`events.md` § Agenda and attachments): the event sheet on web, and Event details on the phone.

## Not yet

- **Warning when an assignee can't open a record** attached to their task. The recommended answer, waiting on Paul, is to warn and never widen access.
- **Ask** attaching the docs a member names, and offering suggested ones to add with a tap.
- **Copy link** on a record, links pasted in chat drawn as cards, and a **+** key in the composer that mentions documents, events and tasks.
