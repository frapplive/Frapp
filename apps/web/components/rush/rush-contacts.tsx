"use client";

import { localIsoDate } from "@repo/formatting";
import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  useLogRushContact,
  useRushContacts,
  type RushContactKind,
  type RushPipelineCandidate,
  rushContactLine,
} from "@repo/hooks";
import { describeLoadFailure } from "@repo/hooks/error-copy";
import {
  readKeptDraft,
  useKeptDraftKeys,
  useKeptFormDraft,
} from "@repo/hooks/kept-drafts";
import {
  RUSH_CONTACT_KINDS,
  RUSH_CONTACT_KIND_LABELS,
  RUSH_CONTACT_LOOKBACK_DAYS,
  RUSH_CONTACT_NOTE_MAX,
  shiftRushDayKey,
} from "@repo/validation";
import { SectionLabel } from "@/components/shared/section-label";
import { NestedError } from "@/components/shared/nested-states";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toastFailure } from "@/lib/failure-toast";

/**
 * Log contact (#5934, `rush:add`): a button that opens the kinds, and a pick
 * logs that kind today, so the everyday "texted him" is two clicks, as
 * HubSpot's Log call and Pipedrive's quick activity are. The last row opens a
 * short dialog for another day or a note. The prospect's last-contact line
 * and their cleared follow-up show at once (`useLogRushContact` is
 * optimistic), so there is no toast to say it worked.
 */
export function LogContactMenu({
  candidate,
  disabled,
  viewerName,
}: {
  candidate: RushPipelineCandidate;
  disabled: boolean;
  /** For the optimistic "by …" until the server answers. */
  viewerName: string | null;
}) {
  const log = useLogRushContact();
  const [dialogOpen, setDialogOpen] = useState(false);

  function quick(kind: RushContactKind) {
    log.mutate(
      {
        candidateId: candidate.id,
        kind,
        contactedOn: localIsoDate(new Date()),
        byName: viewerName ?? undefined,
      },
      {
        onError: (error) =>
          toastFailure({
            title: "Couldn't log that contact",
            error,
            fallback: "Retry in a moment.",
          }),
      },
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="shrink-0 gap-1.5"
            disabled={disabled}
          >
            Log contact
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {RUSH_CONTACT_KINDS.map((kind) => (
            <DropdownMenuItem key={kind} onSelect={() => quick(kind)}>
              {RUSH_CONTACT_KIND_LABELS[kind]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialogOpen(true)}>
            Another day or a note…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {dialogOpen ? (
        <LogContactDialog
          candidate={candidate}
          viewerName={viewerName}
          onClose={() => setDialogOpen(false)}
        />
      ) : null}
    </>
  );
}

interface ContactDraft {
  kind: RushContactKind;
  day: string;
  note: string;
}

/**
 * The longer way: which kind, which day (today back to 120 days), and a note.
 * A short question, so a centred dialog (rulebook § 9). Closing it keeps what
 * was typed for this prospect (rulebook § 4); logging drops it.
 */
function LogContactDialog({
  candidate,
  viewerName,
  onClose,
}: {
  candidate: RushPipelineCandidate;
  viewerName: string | null;
  onClose: () => void;
}) {
  const log = useLogRushContact();
  const keys = useKeptDraftKeys();
  const form = `rush-contact:${candidate.id}`;
  const today = localIsoDate(new Date());
  const [opening] = useState(() =>
    readKeptDraft<ContactDraft>(keys.draft(form)),
  );
  const [draft, setDraft] = useState<ContactDraft>(
    opening ?? { kind: "text", day: today, note: "" },
  );
  const kept = useKeptFormDraft(form, true, draft, {
    restoredAtMount: opening !== undefined,
  });
  const [tried, setTried] = useState(false);
  const kindId = useId();
  const noteId = useId();
  const dayProblem = !/^\d{4}-\d{2}-\d{2}$/.test(draft.day)
    ? "Pick the day you reached them."
    : draft.day > today
      ? "Pick today or an earlier day."
      : draft.day < shiftRushDayKey(today, -RUSH_CONTACT_LOOKBACK_DAYS)
        ? `Pick a day in the last ${RUSH_CONTACT_LOOKBACK_DAYS} days.`
        : null;

  function submit() {
    setTried(true);
    if (dayProblem || log.isPending) return;
    kept.hold();
    log.mutate(
      {
        candidateId: candidate.id,
        kind: draft.kind,
        contactedOn: draft.day,
        note: draft.note,
        byName: viewerName ?? undefined,
      },
      {
        onSuccess: () => kept.drop(),
        onError: (error) => {
          kept.release();
          toastFailure({
            title: "Couldn't log that contact",
            error,
            fallback: "Retry in a moment.",
          });
        },
      },
    );
    // Optimistic: the panel shows it at once.
    onClose();
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>Log contact with {candidate.display_name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={kindId}>How</Label>
            <Select
              value={draft.kind}
              onValueChange={(kind) =>
                setDraft({ ...draft, kind: kind as RushContactKind })
              }
            >
              <SelectTrigger id={kindId} aria-label="How">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RUSH_CONTACT_KINDS.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {RUSH_CONTACT_KIND_LABELS[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>When</Label>
            <DateField
              aria-label="When"
              value={draft.day}
              lean="back"
              onChange={(day) => setDraft({ ...draft, day })}
              error={tried ? dayProblem : null}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={noteId}>Note</Label>
            <Textarea
              id={noteId}
              value={draft.note}
              maxLength={RUSH_CONTACT_NOTE_MAX}
              onChange={(event) =>
                setDraft({ ...draft, note: event.target.value })
              }
              className="min-h-[72px] resize-y"
            />
          </div>
          <DialogFooter>
            <Button type="submit" size="sm" disabled={log.isPending}>
              Log contact
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** How many contacts show before "Show all". */
const CONTACTS_SHOWN = 5;

/**
 * The prospect's logged contacts, newest first: "Texted · November 18 · by Chris",
 * with its note under it for a reader who may see notes (the server leaves
 * the note out otherwise). Drawn only once there is one: the line at the top
 * of the panel already says when nobody has logged any.
 */
export function RushContactHistory({
  candidateId,
  today,
}: {
  candidateId: string;
  today: string;
}) {
  const headingId = useId();
  const contacts = useRushContacts(candidateId);
  const [all, setAll] = useState(false);
  if (contacts.isPending) return null;
  if (contacts.isError) {
    return (
      <NestedError
        title="Couldn't load contacts"
        description={describeLoadFailure(contacts.error)}
        onRetry={() => void contacts.refetch()}
      />
    );
  }
  const list = contacts.data;
  if (list.length === 0) return null;
  const shown = all ? list : list.slice(0, CONTACTS_SHOWN);
  return (
    <section aria-labelledby={headingId} className="grid gap-2">
      <SectionLabel id={headingId} count={list.length}>
        Contacts
      </SectionLabel>
      <ul className="divide-y divide-border">
        {shown.map((contact) => (
          <li key={contact.id} className="py-2">
            <p className="text-sm text-foreground">
              {rushContactLine(contact, today)}
            </p>
            {contact.note ? (
              <p className="whitespace-pre-wrap break-words pt-0.5 text-sm text-muted-foreground">
                {contact.note}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {list.length > CONTACTS_SHOWN && !all ? (
        <div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setAll(true)}
          >
            Show all {list.length}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
